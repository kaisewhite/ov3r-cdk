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
  envs: string[];
  slackWorkspaceId: string;
  pipelineSlackChannelId: string;
  services: Service[];
}

export const projects: Project[] = [
  {
    name: "ov3r",
    domain: "ov3r.tech",
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
    envs: ["dev"],
    slackWorkspaceId: "T05AXT2C65P",
    pipelineSlackChannelId: "C08M9NN4WHX",
    services: [
      {
        name: "ai-chatbot",
        type: "platform",
        description: "NextJS Application - Frontend interface for chatbot",
        ecrRepositoryRequired: true,
        github: "arqlo-ai-chatbot",
        properties: {
          subdomain: "chat", priority: 1, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0

        },
        healthCheck: "/healthcheck",
        secrets: [
          "AUTH_SECRET",
          "OPENAI_API_KEY",
          "POSTGRES_URL",
          "NEXTAUTH_URL",
          "METADATA_BASE_URL"
        ],
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




