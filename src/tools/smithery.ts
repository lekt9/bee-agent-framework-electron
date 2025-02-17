import { BaseToolRunOptions, ToolEmitter, ToolInput, JSONToolOutput, Tool } from '@/tools/base.js';
import { Emitter } from '@/emitter/emitter.js';
import { GetRunContext } from '@/context.js';
import { MultiClient } from '@smithery/sdk';
import { SchemaObject } from 'ajv';
import { paginate } from '@/internals/helpers/paginate.js';

export interface SmitheryToolInput {
  client: MultiClient;
  tool: string;
}

export class SmitheryToolOutput extends JSONToolOutput<any> {}

export class SmitheryTool extends Tool<SmitheryToolOutput> {
  public readonly name: string;
  public readonly description: string;
  public readonly emitter: ToolEmitter<ToolInput<this>, SmitheryToolOutput>;

  public readonly client: MultiClient;
  private readonly tool: string;

  public constructor({ client, tool, ...options }: SmitheryToolInput) {
    super(options);
    this.client = client;
    this.tool = tool;
    this.name = tool;
    this.description = 'Smithery tool implementation';
    this.emitter = Emitter.root.child({
      namespace: ['tool', 'smithery', this.name],
      creator: this,
    });
  }

  public inputSchema() {
    return {} as SchemaObject;
  }

  protected async _run(
    input: ToolInput<this>,
    _options: BaseToolRunOptions,
    run: GetRunContext<typeof this>,
  ) {
    const result = await this.client.clients[this.tool].request({
      method: 'execute',
      params: input,
      signal: run.signal,
    });
    return new SmitheryToolOutput(result);
  }

  public static async fromClient(client: MultiClient): Promise<SmitheryTool[]> {
    const tools = await client.listTools();
    return tools.map((tool) => new SmitheryTool({ client, tool }));
  }
}
