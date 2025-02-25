interface propertiesConfig {
  hostHeaders: string[];
  priority: number;
  desiredCount: number;
  memoryLimitMiB: number;
  cpu: number;
}

interface Service {
  name: string;
  type: string;
  envs: string[];
  github: string;
  properties: { [key: string]: propertiesConfig };
  secrets?: string[];
  healthCheck: string;
}

export const services: Service[] = [
  {
    name: "api-svc",
    type: "fargate",
    envs: ["dev", "prod"],
    github: "ov3r-api",
    properties: {
      dev: { hostHeaders: ["api.dev.ov3r.tech"], priority: 3, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
      prod: { hostHeaders: ["api.ov3r.tech"], priority: 3, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
    },
    healthCheck: "/healthcheck",
    secrets: [
      "PGHOST",
      "PGPORT",
      "PGUSER",
      "PGPASSWORD",
      "PGDATABASE",
      "OPENAI_API_KEY",
      "OPEN_AI_MODEL_NAME",
      "REDIS_CACHE_HOST_ENDPOINT",
      "DEFAULT_CACHE_TTL",
    ],
  },
  {
    name: "web-svc",
    type: "fargate",
    envs: ["dev", "prod"],
    github: "ov3r-web",
    properties: {
      dev: { hostHeaders: ["console.dev.ov3r.tech"], priority: 4, memoryLimitMiB: 1024, cpu: 512, desiredCount: 1 },
      prod: { hostHeaders: ["console.ov3r.tech"], priority: 4, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
    },
    healthCheck: "/",
    secrets: [
      "PGHOST",
      "PGPORT",
      "PGUSER",
      "PGPASSWORD",
      "PGDATABASE",
      "OPENAI_API_KEY",
      "OPEN_AI_MODEL_NAME",
      "REDIS_CACHE_HOST_ENDPOINT",
      "DEFAULT_CACHE_TTL",
    ],
  },
];
