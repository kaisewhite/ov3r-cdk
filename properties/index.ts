interface propertiesConfig {
  subdomain: string;
  priority: number;
  desiredCount: number;
  memoryLimitMiB: number;
  cpu: number;
}

export interface Service {
  name: string;
  description: string;
  type: string;
  ecrRepositoryRequired: boolean;
  github?: string;
  properties: propertiesConfig;
  secrets?: string[];
  healthCheck?: string;
}

export interface Project {
  name: string;
  domain: string;
  githubSourceOwner: string;
  codestarConnectionArn: string;
  envs: string[];
  slackWorkspaceId: string;
  pipelineSlackChannelId: string;
  services: Service[];
}

export const projects: Project[] = [
  {
    name: "ov3r",
    domain: "ov3r.tech",
    githubSourceOwner: "kaisewhite",
    codestarConnectionArn: "arn:aws:codeconnections:us-east-2:366394957699:connection/969d2839-963c-4ff8-bc48-7205ba5c2fd0",
    envs: ["dev"],
    slackWorkspaceId: "T05AXT2C65P",
    pipelineSlackChannelId: "C08EL3YB490",
    services: [
      {
        name: "postgres",
        type: "database",
        description: "Postgres database",
        ecrRepositoryRequired: false,
        properties: {
          subdomain: "postgres",
          priority: 1,
          memoryLimitMiB: 1024,
          cpu: 512,
          desiredCount: 1,
        },
      },
    ],
  },
  {
    name: "mostrom",
    domain: "mostrom.tech",
    githubSourceOwner: "Mostrom-LLC",
    codestarConnectionArn: "arn:aws:codeconnections:us-east-2:366394957699:connection/b9b27aa2-c776-4777-ae60-83ba689141c3",
    envs: ["dev"],
    slackWorkspaceId: "T05AXT2C65P",
    pipelineSlackChannelId: "C08M9NN4WHX",
    services: [
      {
        name: "ai-chatbot",
        type: "platform",
        description: "NextJS Application - Frontend interface for chatbot",
        ecrRepositoryRequired: true,
        github: "ai-chatbot",
        properties: {
          subdomain: "chat",
          priority: 1,
          memoryLimitMiB: 1024,
          cpu: 512,
          desiredCount: 0,
        },
        healthCheck: "/healthcheck",
        secrets: ["AUTH_SECRET", "OPENAI_API_KEY", "POSTGRES_URL", "NEXTAUTH_URL", "METADATA_BASE_URL", "NEXT_PUBLIC_APP_ENV"],
      },
      {
        name: "postgres",
        type: "database",
        description: "Postgres database",
        ecrRepositoryRequired: false,
        properties: {
          subdomain: "postgres",
          priority: 1,
          memoryLimitMiB: 1024,
          cpu: 512,
          desiredCount: 1,
        },
      },
    ],
  },
] as const;
