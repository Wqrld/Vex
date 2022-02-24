
import { PrismaClient, User } from '@prisma/client'
import { Application, Response, Request, NextFunction } from "express";
const rateLimit = require("express-rate-limit");
const session = require('express-session');
const nodemailer = require('nodemailer');
const csurf = require('csurf');
const csrf = csurf({ cookie: false })
const crypto = require("crypto");

// Rate Limiter for the auth endpoints
const authLimit = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 6, // start blocking after 5 requests
    message:
        "Too many auth requests, try again in 10 minutes"
});

// Fix to allow express session to work with TS
declare module 'express-session' {
    interface SessionData {
        user: User;
    }
}

function validateInput(input: string): boolean {
    if (input.includes("<") || input.includes('"') || input.includes('.') || input.includes(' ') || input.includes(">") || input.length < 3) {
        return false;
    } else {
        return true
    }
}

function validateEmail(email: string): boolean {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;//eslint-disable-line
    return re.test(String(email).toLowerCase());
}

function requiresAdmin(req: Request, res: Response, next: NextFunction) {
    if (req.session && req.session.user && req.session.user.role == "admin") {
        next();
    } else {
        res.redirect('/');
    }
}

function requiresLoggedIn(req: Request, res: Response, next: NextFunction) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

module.exports = function (app: Application, prisma: PrismaClient) {

    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false,
            httpOnly: true
        }
    }));

    // Admin Page
    app.get('/admin', requiresAdmin, async function (req: Request, res: Response) {
        const allUsers = await prisma.user.findMany({
            include: { posts: true },
          });

        res.render('admin', {allUsers})
    });

    // User Dashboard Page
    app.get('/dashboard', requiresLoggedIn, async function (req: Request, res: Response) {
        res.render('dashboard', {currentUser: req.session.user})
    });

    // Login Page
    app.get('/login', function (req: Request, res: Response) {

        // Check if the user is already logged in.
        if (req.session && req.session.user) {
            return res.redirect('/admin');
        }

        res.render('auth/login');

    });

    // Login Logic
    app.post('/login', authLimit, async function (req: Request, res: Response) {
        const { email, password }: { email: string, password: string } = req.body;

        if (!validateEmail(email)) {
            res.render('auth/login', {
                error: "Invalid email"
            });
        }

        const user = await prisma.user.findFirst({
            where: {
                email: email
            }
        });

        if (!user) {
            res.render('auth/login', {
                error: "User not found"
            });
            return;
        }
        // Generate a hash from the password to compare with the hash in the database
        crypto.pbkdf2(password, user.salt + process.env.PASSWORD_PEPPER, 100000, 64, 'sha512', function (err: string, derivedKey: Buffer) {

            if (user.password !== derivedKey.toString('hex')) {
                res.render('auth/login', {
                    error: "Wrong password"
                });
                return;
            }

            req.session.user = user;
            res.redirect('/');

        });



    });



    // Registration page
    app.get('/register', function (req: Request, res: Response) {

        // Check if the user is already logged in.
        if (req.session && req.session.user) {
            return res.redirect('/admin');
        }

        res.render('auth/register');
    });

    // Registration logic
    app.post('/register', authLimit, async function (req: Request, res: Response) {
        const { name, email, password, password2 }: { name: string, email: string, password: string, password2: string } = req.body;
        if (!validateInput(name)) {
            res.render('auth/register', {
                error: "Invalid input"
            });
            return;
        }
        if (!validateEmail(email)) {
            res.render('auth/register', {
                error: "Invalid email"
            });
            return;
        }
        if (password !== password2) {
            res.render('auth/register', {
                error: "Passwords do not match"
            });
            return;
        }
        const user = await prisma.user.findFirst({
            where: {
                email: email
            }
        });

        if (user) {
            res.render('auth/register', {
                error: "User already exists"
            });
            return;
        }

        // Generate a random salt and hash the password
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.pbkdf2(password, salt + process.env.PASSWORD_PEPPER, 100000, 64, 'sha512', async function (err: string, derivedKey: Buffer) {
            if (err) {
                res.render('auth/register', {
                    error: "An error occured"
                });
                return;
            }
            const newUser = await prisma.user.create({
                data: {
                    email: email,
                    password: derivedKey.toString('hex'),
                    salt: salt,
                    name: name
                }
            });
            req.session.user = newUser;
            res.redirect('/');
        });
    });

    // Request new password
    app.get('/forgot', function (req: Request, res: Response) {
        res.render('auth/forgot');
    });

    // Request new password logic
    app.post('/forgot', authLimit, async function (req: Request, res: Response) {
        const { email }: { email: string } = req.body;
        if (!validateEmail(email)) {
            res.render('auth/forgot', {
                error: "Invalid email"
            });
            return;
        }
        const user = await prisma.user.findFirst({
            where: {
                email: email
            }
        });
        if (!user) {
            res.render('auth/forgot', {
                error: "User not found"
            });
            return;
        }

        // Createa a new password reset token that is valid for 1 hour
        const token = crypto.randomBytes(16).toString('hex');
        await prisma.user.update({
            where: {
                id: user.id
            },
            data: {
                resetToken: token,
                resetTokenExpiry: Date.now() + 3600000 // 1 hour
            }
        });
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE == 'true' ? true : false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
        });
        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: 'Password reset',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n
            Please click on the following link, or paste this into your browser to complete the process:\n\n
            ${process.env.URL}/reset/${token}\n\n

            If you did not request this, please ignore this email and your password will remain unchanged.\n\n
            This password reset token is valid for 1 hour.`
        };
        transporter.sendMail(mailOptions, function (err: string, info: any) {
            if (err) {
                console.log(err)
                res.render('auth/forgot', {
                    error: "An error occured"
                });
                return;
            }
            res.render('auth/forgot', {
                success: "An email has been sent to " + email + " with further instructions."
            });
        });
    });

    // Reset password page
    app.get('/reset/:token', function (req: Request, res: Response) {
        res.render('auth/reset', {
            token: req.params.token
        });
    });

    // Reset password logic
    app.post('/reset/:token', authLimit, async function (req: Request, res: Response) {
        const { password, password2 }: { password: string, password2: string } = req.body;
        if (password !== password2) {
            res.render('auth/reset', {
                error: "Passwords do not match"
            });
            return;
        }
        const user = await prisma.user.findFirst({
            where: {
                resetToken: req.params.token,
                resetTokenExpiry: {
                    gt: Date.now()
                }
            }
        });
        if (!user) {
            res.render('auth/reset', {
                error: "Invalid token"
            });
            return;
        }

        // Generate a new password hash for the user and store it in the database
        crypto.pbkdf2(password, user.salt + process.env.PASSWORD_PEPPER, 100000, 64, 'sha512', async function (err: string, derivedKey: Buffer) {
            if (err) {
                res.render('auth/reset', {
                    error: "An error occured"
                });
                return;
            }
            await prisma.user.update({
                where: {
                    id: user.id
                },
                data: {
                    password: derivedKey.toString('hex'),
                    resetToken: null,
                    resetTokenExpiry: null
                }
            });
            res.redirect('/');
        });
    });



    // log the user out
    app.post('/logout', (req: Request, res: Response) => {
        req.session.destroy((err: string) => {
            res.redirect('/') // will always fire after session is destroyed
        })
    });



}