// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const backendRoot = path.resolve(__dirname, "../..");
const backendEnvPath = path.join(backendRoot, ".env");
const repoEnvPath = path.resolve(backendRoot, "../.env");

let hasLoaded = false;
const loadedEnvFiles: string[] = [];

export function loadBackendEnv() {
  if (hasLoaded) {
    return { loadedEnvFiles, backendEnvPath, repoEnvPath };
  }

  hasLoaded = true;

  // Prefer backend/.env for local backend runs. Root .env only fills missing keys.
  for (const envPath of [backendEnvPath, repoEnvPath]) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      loadedEnvFiles.push(envPath);
    }
  }

  return { loadedEnvFiles, backendEnvPath, repoEnvPath };
}

export function getEnv(name: string, fallback = ""): string {
  loadBackendEnv();
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function getLoadedEnvFiles(): string[] {
  loadBackendEnv();
  return [...loadedEnvFiles];
}

loadBackendEnv();
