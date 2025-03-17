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
  /*  {
    name: "api-svc",
    type: "fargate",
    envs: ["dev", "prod"],
    github: "ov3r-api",
    properties: {
      dev: { hostHeaders: ["api.dev.ov3r.tech"], priority: 4, memoryLimitMiB: 1024, cpu: 512, desiredCount: 1 },
      prod: { hostHeaders: ["api.ov3r.tech"], priority: 4, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
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
  }, */
  {
    name: "advisor-api-svc",
    type: "fargate",
    envs: ["dev", "prod"],
    github: "ov3r-api",
    properties: {
      dev: { hostHeaders: ["advisor.dev.ov3r.tech"], priority: 3, memoryLimitMiB: 1024, cpu: 512, desiredCount: 1 },
      prod: { hostHeaders: ["advisor.ov3r.tech"], priority: 3, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
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
    name: "comprehend-api-svc",
    type: "fargate",
    envs: ["dev", "prod"],
    github: "ov3r-api",
    properties: {
      dev: { hostHeaders: ["comprehend.dev.ov3r.tech"], priority: 2, memoryLimitMiB: 1024, cpu: 512, desiredCount: 1 },
      prod: { hostHeaders: ["comprehend.ov3r.tech"], priority: 2, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
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
      dev: { hostHeaders: ["console.dev.ov3r.tech"], priority: 1, memoryLimitMiB: 1024, cpu: 512, desiredCount: 1 },
      prod: { hostHeaders: ["console.ov3r.tech"], priority: 1, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
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
      "NEXT_PUBLIC_APP_ENV",
      "DEFAULT_CACHE_TTL",
    ],
  },
  {
    name: "view-sync-svc",
    type: "fargate",
    envs: ["dev", "prod"],
    github: "enframe",
    properties: {
      dev: { hostHeaders: ["viewsync.dev.ov3r.tech"], priority: 5, memoryLimitMiB: 1024, cpu: 512, desiredCount: 1 },
      prod: { hostHeaders: ["console.ov3r.tech"], priority: 5, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
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
      "NEXT_PUBLIC_APP_ENV",
      "DEFAULT_CACHE_TTL",
      "NEXT_PUBLIC_OPEN_WEATHER_API_KEY",
    ],
  },
];
