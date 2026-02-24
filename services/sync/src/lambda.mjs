import serverlessExpress from "@vendia/serverless-express";
import { createApp } from "./server.mjs";

const app = createApp();

export const handler = serverlessExpress({ app });

