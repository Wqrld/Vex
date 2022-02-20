import { PrismaClient } from '@prisma/client'
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

// A example that uses the prisma client to retrieve data
app.get("/", async (req: Request, res: Response) => {

  const allUsers = await prisma.user.findMany({
    include: { posts: true },
  });
  console.log(allUsers);
  res.render('home', { allUsers });

});

// Load the authentication subsystem
if (process.env.AUTH_ENABLED === 'true') {
  require("./routes/auth.ts")(app, prisma);
}

// Listen on port the port defined in the .env file
app.listen(Number(process.env.PORT) ?? 6033, process.env.HOST ?? "0.0.0.0", function () {
  console.log(`Server running on port ${process.env.PORT}`);
});