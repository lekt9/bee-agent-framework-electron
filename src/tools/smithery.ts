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

// Import only non-MCP utilities statically.
import {
  BaseToolRunOptions,
  ToolEmitter,
  ToolInput,
  JSONToolOutput,
  Tool,
} from "@/tools/base.js";
import { Emitter } from "@/emitter/emitter.js";
import { GetRunContext } from "@/context.js";
import { SchemaObject } from "ajv";
import { paginate } from "@/internals/helpers/paginate.js";

/**
 * NOTE:
 * We no longer statically import any Model Context Protocol modules.
 * Instead, the MCP client and tool types are passed in dynamically.
 */

export interface SmitheryToolInput {
  client: any; // dynamically imported MCP client
  tool: any; // dynamically imported tool definition from MCP
}

export class SmitheryToolOutput extends JSONToolOutput<any> {}

export class SmitheryTool extends Tool<SmitheryToolOutput> {
  public readonly name: string;
  public readonly description: string;
  public readonly emitter: ToolEmitter<ToolInput<this>, SmitheryToolOutput>;

  public readonly client: any;
  private readonly tool: any;

  public constructor({ client, tool, ...options }: SmitheryToolInput) {
    super(options);
    this.client = client;
    this.tool = tool;
    this.name = tool.name;
    this.description =
      tool.description ??
      "No available description, use the tool based on its name and schema.";
    this.emitter = Emitter.root.child({
      namespace: ["tool", "smithery", this.name],
      creator: this,
    });
  }

  public inputSchema(): SchemaObject {
    // Use the tool's defined input schema.
    return this.tool.inputSchema as SchemaObject;
  }

  protected async _run(
    input: ToolInput<this>,
    _options: BaseToolRunOptions,
    run: GetRunContext<typeof this>
  ): Promise<SmitheryToolOutput> {
    // Call the tool via the MCP client.
    const result = await this.client.callTool(
      { name: this.name, arguments: input },
      undefined,
      { signal: run.signal }
    );
    return new SmitheryToolOutput(result);
  }

  /**
   * Load all available tools from the provided MCP client.
   *
   * Uses the paginate helper to retrieve all pages of tools.
   */
  public static async fromClient(client: any): Promise<SmitheryTool[]> {
    // Optionally, if you want to load the paginate helper dynamically,
    // you can do the following:
    // const { paginate } = await import('@/internals/helpers/paginate.js');
    const tools = await paginate({
      size: Infinity,
      handler: async ({ cursor }: { cursor?: string }) => {
        const { tools, nextCursor } = await client.listTools({ cursor });
        return { data: tools, nextCursor } as const;
      },
    });
    return tools.map((tool: any) => new SmitheryTool({ client, tool }));
  }
}
