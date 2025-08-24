// swaggerOptions.js
require("dotenv").config();
const path = require("path");

const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Sitescope Backend",
            version: "1.0.0",
            description: "Express API with Prisma and Swagger",
        },
        servers: [
            {
                url: process.env.BASE_URL || "http://localhost:3000",
            },
        ],
    },
    apis: ['./src/routes/*.js'],
};

module.exports = swaggerOptions;