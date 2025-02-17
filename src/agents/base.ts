/**
 * Copyright 2025 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { FrameworkError } from "@/errors.js";
import { AgentMeta } from "@/agents/types.js";
import { Serializable } from "@/internals/serializable.js";
import { GetRunContext, RunContext } from "@/context.js";
import { Emitter } from "@/emitter/emitter.js";
import { createTelemetryMiddleware } from "@/instrumentation/create-telemetry-middleware.js";
import { INSTRUMENTATION_ENABLED } from "@/instrumentation/config.js";
import { doNothing } from "remeda";
import { BaseMemory } from "@/memory/base.js";

export class AgentError extends FrameworkError {}

export interface BaseAgentRunOptions {
  signal?: AbortSignal;
}

export abstract class BaseAgent<
  TInput,
  TOutput,
  TOptions extends BaseAgentRunOptions = BaseAgentRunOptions,
> extends Serializable {
  protected isRunning = false;

  public abstract readonly emitter: Emitter<unknown>;

  public run(
    ...[input, options]: Partial<TOptions> extends TOptions
      ? [input: TInput, options?: TOptions]
      : [input: TInput, options: TOptions]
  ) {
    if (this.isRunning) {
      throw new AgentError("Agent is already running!");
    }

    return RunContext.enter(
      this,
      { signal: options?.signal, params: [input, options] as const },
      async (context) => {
        try {
          console.log('Starting agent run with:', { 
            agentType: this.constructor.name,
            input,
            options 
          });
          this.isRunning = true;
          // @ts-expect-error
          return await this._run(input, options, context);
        } catch (e) {
          console.error('Agent run error:', {
            error: e,
            stack: e instanceof Error ? e.stack : undefined,
            cause: e instanceof Error ? e.cause : undefined
          });
          
          if (e instanceof AgentError) {
            throw e;
          } else {
            throw new AgentError(
              `Error has occurred in ${this.constructor.name}: ${e instanceof Error ? e.message : String(e)}`,
              [e]
            );
          }
        } finally {
          console.log('Agent run completed');
          this.isRunning = false;
        }
      },
    ).middleware(INSTRUMENTATION_ENABLED ? createTelemetryMiddleware() : doNothing());
  }

  protected abstract _run(
    input: TInput,
    options: TOptions,
    run: GetRunContext<typeof this>,
  ): Promise<TOutput>;

  destroy() {
    this.emitter.destroy();
  }

  public abstract set memory(memory: BaseMemory);
  public abstract get memory(): BaseMemory;

  public get meta(): AgentMeta {
    return {
      name: this.constructor.name ?? "BaseAgent",
      description: "",
      tools: [],
    };
  }

  createSnapshot() {
    return { isRunning: false };
  }

  loadSnapshot(snapshot: ReturnType<typeof this.createSnapshot>) {
    Object.assign(this, snapshot);
  }
}
