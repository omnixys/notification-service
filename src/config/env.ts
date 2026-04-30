/**
 * @license GPL-3.0-or-later
 * Copyright (C) 2025 Caleb Gyamfi - Omnixys Technologies
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * For more information, visit <https://www.gnu.org/licenses/>.
 */

import 'dotenv/config';
import process from 'node:process';

const warned = new Set<string>();

type EnvValue = string | number | boolean;
interface EnvOptions<T extends EnvValue> {
  required?: boolean;
  transform?: (v: string) => T;
}

function getEnv(
  key: string,
  fallback?: string,
  options?: EnvOptions<string>,
): string;
function getEnv<T extends EnvValue>(
  key: string,
  fallback: string,
  options: EnvOptions<T> & { transform: (v: string) => T },
): T;
function getEnv<T extends EnvValue>(
  key: string,
  fallback?: string,
  options?: EnvOptions<T>,
): EnvValue {
  const raw = process.env[key];

  if (!raw) {
    if (!warned.has(key) && process.env.NODE_ENV !== 'production') {
      console.warn(
        `[ENV] Missing "${key}" → using fallback: ${fallback ?? 'undefined'}`,
      );
      warned.add(key);
    }

    if (options?.required && process.env.NODE_ENV === 'production') {
      throw new Error(`[ENV] Missing required env: ${key}`);
    }

    return fallback ?? '';
  }

  return options?.transform ? options.transform(raw) : raw;
}

const toBool = (v: string): boolean => v === 'true';
const toNumber = (v: string): number => Number(v);

/**
 * Environment variable configuration for the Node-based server.
 *
 * This file centralizes all environment parameters provided
 * through `.env` or system variables.
 *
 * @remarks
 * - All values are explicitly typed.
 * - Missing variables get sensible defaults (only for DEV).
 * - Booleans are converted correctly from "true"/"false" strings.
 */
export const env = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),

  SCHEMA_TARGET: getEnv('SCHEMA_TARGET', 'true'),

  LOG_DEFAULT: getEnv('LOG_DEFAULT', 'false', { transform: toBool }),
  LOG_DIRECTORY: getEnv('LOG_DIRECTORY', 'log'),
  LOG_FILE_DEFAULT_NAME: getEnv('LOG_FILE_DEFAULT_NAME', 'server.log'),
  LOG_PRETTY: getEnv('LOG_PRETTY', 'false', { transform: toBool }),
  LOG_LEVEL: getEnv('LOG_LEVEL', 'info'),

  HTTPS: getEnv('HTTPS', 'false', { transform: toBool }),
  KEYS_PATH: getEnv('KEYS_PATH', './keys'),

  TEMPO_URI: getEnv('TEMPO_URI', 'http://localhost:4318/v1/traces'),

  PORT: getEnv('PORT', '4000', { transform: toNumber }),

  // 🔴 CRITICAL → required in prod
  KC_CLIENT_SECRET: getEnv('KC_CLIENT_SECRET', '', { required: true }),
  KC_URL: getEnv('KC_URL', 'http://localhost:18080/auth'),
  KC_REALM: getEnv('KC_REALM', 'camunda-platform'),
  KC_CLIENT_ID: getEnv('KC_CLIENT_ID', 'camunda-identity'),
  KC_ADMIN_USERNAME: getEnv('KC_ADMIN_USERNAME', 'admin'),
  KC_ADMIN_PASSWORD: getEnv('KC_ADMIN_PASSWORD', 'admin'),

  KAFKA_BROKER: getEnv('KAFKA_BROKER', 'localhost:9092'),
  SERVICE: getEnv('SERVICE', 'SERVICE'),

  DATABASE_URL: getEnv('DATABASE_URL', '', { required: true }),

  KEYCLOAK_HEALTH_URL: getEnv('KEYCLOAK_HEALTH_URL', ''),
  TEMPO_HEALTH_URL: getEnv('TEMPO_HEALTH_URL', ''),
  PROMETHEUS_HEALTH_URL: getEnv('PROMETHEUS_HEALTH_URL', ''),

  GQL_PUBSUB_INMEMORY: getEnv('GQL_PUBSUB_INMEMORY', 'false', {
    transform: toBool,
  }),

  PC_JWE_KEY: getEnv('PC_JWE_KEY', '', { required: true }),
  PC_TTL_SEC: getEnv('PC_TTL_SEC', String(60 * 60 * 24 * 30), {
    transform: toNumber,
  }),

  VALKEY_URL: getEnv('VALKEY_URL', 'valkey://localhost:6380'),
  VALKEY_PASSWORD: getEnv('VALKEY_PASSWORD', '', { required: true }),

  ENCRYPTION_KEY: getEnv('ENCRYPTION_KEY', '', { required: true }),

  RESEND_API_KEY: getEnv('RESEND_API_KEY', '', { required: true }),

  APP_BASE_URL: getEnv('APP_BASE_URL', 'http://localhost:3000', {
    required: true,
  }),
  VERIFY_PATH: getEnv('VERIFY_PATH', '/verify'),
  VERIFY_GUEST_PATH: getEnv('VERIFY_GUEST_PATH', '/verify-guest'),
  MAGIC_PATH: getEnv('MAGIC_PATH', '/magic'),
  RESET_PATH: getEnv('RESET_PATH', '/reset'),

  FROM_NO_REPLY: getEnv('FROM_NO_REPLY', 'Omnixys <no-reply@omnixys.com>'),
  FROM_SUPPORT: getEnv('FROM_SUPPORT', 'Omnixys Support <support@omnixys.com>'),
  FROM_SECURITY: getEnv(
    'FROM_SECURITY',
    'Omnixys Security <security@omnixys.com>',
  ),

  CHROME_PATH: getEnv('CHROME_PATH', '', { required: true }),
  COOKIE_SECRET: getEnv('COOKIE_SECRET', 'omnixys-default-secret'),
} as const;

// /**
//  * Debug output:
//  * Print all environment variables in non-production environments.
//  */
// if (process.env.NODE_ENV !== 'production') {
//   console.log('================= ENVIRONMENT VARIABLES =================');
//   console.log(JSON.stringify(env, null, 2));
//   console.log('==========================================================');
// }
