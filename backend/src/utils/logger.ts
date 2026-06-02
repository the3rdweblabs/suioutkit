// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

class Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  public info(module: string, message: string) {
    console.log(
      `${COLORS.dim}[${this.getTimestamp()}]${COLORS.reset} ${COLORS.bright}${COLORS.blue}[INFO]${COLORS.reset} ${COLORS.cyan}[${module}]${COLORS.reset} ${message}`
    );
  }

  public success(module: string, message: string) {
    console.log(
      `${COLORS.dim}[${this.getTimestamp()}]${COLORS.reset} ${COLORS.bright}${COLORS.green}[SUCCESS]${COLORS.reset} ${COLORS.cyan}[${module}]${COLORS.reset} ${message}`
    );
  }

  public warn(module: string, message: string) {
    console.warn(
      `${COLORS.dim}[${this.getTimestamp()}]${COLORS.reset} ${COLORS.bright}${COLORS.yellow}[WARN]${COLORS.reset} ${COLORS.yellow}[${module}]${COLORS.reset} ${message}`
    );
  }

  public error(module: string, message: string, stack?: string) {
    console.error(
      `${COLORS.dim}[${this.getTimestamp()}]${COLORS.reset} ${COLORS.bright}${COLORS.red}[ERROR]${COLORS.reset} ${COLORS.red}[${module}]${COLORS.reset} ${message}`
    );
    if (stack) {
      console.error(`${COLORS.dim}${stack}${COLORS.reset}`);
    }
  }

  public security(module: string, message: string) {
    console.warn(
      `${COLORS.dim}[${this.getTimestamp()}]${COLORS.reset} ${COLORS.bright}${COLORS.magenta}[SECURITY]${COLORS.reset} ${COLORS.magenta}[${module}]${COLORS.reset} ${message}`
    );
  }
}

export const logger = new Logger();
export default logger;
