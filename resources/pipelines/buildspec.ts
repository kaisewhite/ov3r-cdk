import * as codebuild from "aws-cdk-lib/aws-codebuild";

interface NextJSDockerProps {
  imageTag: string;
  ecrURI: string;
  region: string;
  secretVariables: string[];
}

export const NextJSDockerBuildSpec = ({ imageTag, ecrURI, region, secretVariables }: NextJSDockerProps) => {
  return codebuild.BuildSpec.fromObject({
    version: "0.2",
    phases: {
      install: {
        "runtime-versions": { nodejs: "22" },
      },
      pre_build: {
        commands: [
          "echo Logging in to Amazon ECR...",
          "aws --version",
          "node --version",
          `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${ecrURI}`,
        ],
      },
      build: {
        commands: [
          "echo Build started on `date`",
          "echo Building the Docker image...",
          `docker build . -t ${ecrURI}:${imageTag} --no-cache`,
          //`docker build ${secretVariables.map((secret) => `--build-arg ${secret}=$${secret}`).join(" ")} . -t ${ecrURI}:${imageTag} --no-cache`,
        ],
      },
      post_build: {
        commands: ["echo Build completed on `date`", "echo Pushing the Docker images...", `docker push ${ecrURI}:${imageTag}`],
      },
    },
  });
};

interface dockerProps {
  imageTag: string;
  ecrURI: string;
  region: string;
}

export const dockerBuildSpec = ({ imageTag, ecrURI, region }: dockerProps) => {
  return codebuild.BuildSpec.fromObject({
    version: "0.2",
    phases: {
      install: {
        "runtime-versions": { nodejs: "20" },
      },
      pre_build: {
        commands: [
          "echo Logging in to Amazon ECR...",
          "aws --version",
          `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${ecrURI}`,
        ],
      },
      build: {
        commands: ["echo Build started on `date`", "echo Building the Docker image...", `docker build . -t ${ecrURI}:${imageTag}`],
      },
      post_build: {
        commands: ["echo Build completed on `date`", "echo Pushing the Docker images...", `docker push ${ecrURI}:${imageTag}`],
      },
    },
  });
};

interface ecsProps {
  cluster: string;
  service: string;
  roleARN: string;
  desiredCount: number;
  region: string;
  ecrURI: string;
  imageTag: string;
  repoName: string;
  environment: string;
}

export const ecsDeploymentBuildSpec = ({ cluster, service, roleARN, desiredCount, region, ecrURI, imageTag, repoName, environment }: ecsProps) => {
  return codebuild.BuildSpec.fromObject({
    version: "0.2",
    phases: {
      pre_build: {
        commands: ["aws --version"],
      },
      //https://github.com/Integralist/Shell-Scripts/blob/master/aws-cli-assumerole.sh
      build: {
        commands: [
          `echo "===== Get the SHA of the image we just pushed ====="`,
          `IMAGE_SHA=$(aws ecr describe-images --repository-name ${repoName} --image-ids imageTag=${imageTag} --query 'imageDetails[0].imageDigest' --output text)`,
          `echo "New image SHA: $IMAGE_SHA"`,
          `OUT=$(aws sts assume-role --role-arn ${roleARN} --role-session-name AWSCLI-Session)`,
          `export AWS_ACCESS_KEY_ID=$(echo $OUT | jq -r '.Credentials''.AccessKeyId')`,
          `export AWS_SECRET_ACCESS_KEY=$(echo $OUT | jq -r '.Credentials''.SecretAccessKey')`,
          `export AWS_SESSION_TOKEN=$(echo $OUT | jq -r '.Credentials''.SessionToken')`,
          `echo "===== Updating ECS task definition to reference exact image SHA ====="`,
          //# Get current task definition from dev account
          `TASK_FAMILY="${environment}-${repoName}"`,
          `TASK_DEF=$(aws ecs describe-task-definition --task-definition $TASK_FAMILY --region ${region} --query 'taskDefinition' --output json)`,
          //# Update the container image in the task definition to use the exact SHA from management account
          `NEW_TASK_DEF=$(echo $TASK_DEF | jq --arg IMAGE "${ecrURI}@$IMAGE_SHA" '.containerDefinitions[0].image = $IMAGE')`,
          //# Remove fields that can't be included in register-task-definition
          `NEW_TASK_DEF=$(echo $NEW_TASK_DEF | jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')`,
          //# Register the new task definition in dev account
          `NEW_TASK_DEF_ARN=$(aws ecs register-task-definition --cli-input-json "$NEW_TASK_DEF" --region ${region} --query 'taskDefinition.taskDefinitionArn' --output text)`,
          `echo "Registered new task definition: $NEW_TASK_DEF_ARN"`,
          `echo "===== Updating ECS service in dev account ====="`,
          //# Update the service in dev account
          `aws ecs update-service --cluster ${cluster} --service ${service} --desired-count ${desiredCount} --force-new-deployment --region ${region} --task-definition $NEW_TASK_DEF_ARN`,
          //`aws ecs update-service --cluster ${cluster} --service ${service} --desired-count ${desiredCount} --force-new-deployment --region ${region}`,
          `aws ecs wait services-stable --cluster ${cluster} --service ${service} --region ${region}`,
        ],
      },
    },
  });
};
