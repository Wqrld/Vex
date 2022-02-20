
import { PrismaClient, User } from '@prisma/client'
import { Application, Response, Request } from "express";
const rateLimit = require("express-rate-limit");
const session = require('express-session');
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



module.exports = function (app: Application, prisma: PrismaClient) {

    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7,
            secure: false,
            httpOnly: true
        }
    }));

    // Login Page
    app.get('/login', function (req: Request, res: Response) {
        res.render('auth/login');
    });

    // Login Logic
    app.post('/login', authLimit, async function (req: Request, res: Response) {
        const { email, password } = req.body;
        if (!validateInput(password)) {
            res.render('auth/login', {
                error: "Invalid input"
            });
            return;
        }

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
        crypto.pbkdf2(user.password, user.salt + process.env.PASSWORD_PEPPER, 100000, 64, 'sha512', function (err: string, derivedKey: Buffer) {

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
        res.render('auth/register');
    });

    // Registration logic
    app.post('/register', authLimit, async function (req: Request, res: Response) {
        const { name, email, password, password2 } = req.body;
        if (!validateInput(password) || !validateInput(password2)) {
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
            if(err){
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




    // log the user out
    app.post('/logout', (req: Request, res: Response) => {
        req.session.destroy((err: string) => {
            res.redirect('/') // will always fire after session is destroyed
        })
    });



}