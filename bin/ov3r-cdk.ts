#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { Ov3RCdkStack } from "../lib/ov3r-cdk-stack";

const app = new cdk.App();
new Ov3RCdkStack(app, "Ov3RCdkStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  stackName: "infra-ov3r-cdk",
  description: "Deploys infrastructure for audit application",
});
