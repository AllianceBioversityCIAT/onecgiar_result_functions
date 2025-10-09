import serverlessExpress from "@vendia/serverless-express";
import app from "./server.mjs";

export const handler = serverlessExpress({ app });
