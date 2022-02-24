import { PrismaClient, User } from '@prisma/client'
import { Application, NextFunction, Request, Response } from "express";
import { engine } from 'express-handlebars';

// Load .env variables into process.env
require('dotenv').config();

const express = require("express");


const app: Application = new express();

// Use handlebars as view engine
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');

// Support JSON and form bodies
var bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

// Use the public folder for static files
app.use(express.static('public'));

const prisma = new PrismaClient();

declare module 'express-session' {
  interface SessionData {
      user: User;
  }
}

// Load the authentication subsystem
if (process.env.AUTH_ENABLED === 'true') {
  require("./routes/auth.ts")(app, prisma);
}

// A example that uses the prisma client to retrieve data
app.get("/", async (req: Request, res: Response) => {

  if (req.session) {
    res.render('home', {currentUser: req.session.user, auth: process.env.AUTH_ENABLED == 'true', isAdmin: req.session?.user?.role == 'admin'});
  } else {
    res.render('home', {currentUser: null, auth: process.env.AUTH_ENABLED == 'true',isAdmin: false });
  }


});

// Listen on port the port defined in the .env file
app.listen(Number(process.env.PORT) ?? 6033, process.env.HOST ?? "0.0.0.0", function () {
  console.log(`Server running on port ${process.env.PORT}`);
});