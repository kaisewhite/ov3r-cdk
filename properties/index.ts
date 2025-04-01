interface propertiesConfig {
  hostHeader: string;
  priority: number;
  desiredCount: number;
  memoryLimitMiB: number;
  cpu: number;
}

interface Service {
  name: string;
  type: string;
  envs: string[];
  github?: string
  properties: { [key: string]: propertiesConfig };
  secrets?: string[];
  healthCheck?: string;
}

export const services: Service[] = [
  {
    name: "postgres",
    type: "fargate",
    envs: ["dev"],
    properties: {
      dev: { hostHeader: "postgres.dev.ov3r.tech", priority: 1, memoryLimitMiB: 1024, cpu: 512, desiredCount: 1 },
    },
  },
  {
    name: "comprehend-query",
    type: "fargate",
    envs: ["dev"],
    github: "comprehend-query",
    properties: {
      dev: { hostHeader: "query.dev.ov3r.tech", priority: 3, memoryLimitMiB: 1024, cpu: 512, desiredCount: 1 },
      prod: { hostHeader: "query.ov3r.tech", priority: 3, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
    },
    healthCheck: "/healthCheck",
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
    name: "comprehend-web-svc",
    type: "fargate",
    envs: ["dev", "prod"],
    github: "comprehend-web",
    properties: {
      dev: { hostHeader: "console.dev.ov3r.tech", priority: 1, memoryLimitMiB: 1024, cpu: 512, desiredCount: 1 },
      prod: { hostHeader: "console.ov3r.tech", priority: 1, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
    },
    healthCheck: "/healthCheck",
    secrets: [
      "NEXT_PUBLIC_QUERY_API_URL",
      "NEXT_PUBLIC_OPENAI_API_KEY",
      "NEXT_PUBLIC_OPEN_AI_MODEL_NAME",
      "NEXT_PUBLIC_REDIS_CACHE_HOST_ENDPOINT",
      "NEXT_PUBLIC_DATABASE_URL",
      "OPENAI_API_KEY",
    ],
  },
  /*   {
      name: "enframe-svc",
      type: "fargate",
      envs: ["dev", "prod"],
      github: "enframe",
      properties: {
        dev: { hostHeader: "enframe.dev.ov3r.tech", priority: 7, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
        prod: { hostHeader: "enframe.ov3r.tech", priority: 7, memoryLimitMiB: 1024, cpu: 512, desiredCount: 0 },
      },
      healthCheck: "/healthCheck",
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
    }, */
];
