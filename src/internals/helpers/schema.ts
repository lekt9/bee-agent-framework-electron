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

import { TypeOf, ZodType, ZodEffects, ZodTypeAny, AnyZodObject, input } from "zod";
import { zodToJsonSchema, Options } from "zod-to-json-schema";
import { Ajv, SchemaObject, ValidateFunction, Options as AjvOptions } from "ajv";
import addFormats from "ajv-formats";
import { findFirstPair } from "@/internals/helpers/string.js";
import { FrameworkErrorOptions, ValueError } from "@/errors.js";
import { jsonrepair } from "jsonrepair";
export type AnyToolSchemaLike = AnyZodObject | SchemaObject;
export type AnySchemaLike = ZodTypeAny | SchemaObject;
export type FromSchemaLike<T> = T extends ZodTypeAny ? TypeOf<T> : unknown;
export type FromSchemaLikeRaw<T> = T extends ZodTypeAny ? input<T> : unknown;

export function validateSchema<T extends AnySchemaLike>(
  schema: T | ZodEffects<any>,
  errorOptions?: FrameworkErrorOptions,
): asserts schema is T {
  if (schema && schema instanceof ZodEffects) {
    throw new ValueError(
      "zod effects (refine, superRefine, transform, ...) cannot be converted to JSONSchema!",
      [],
      errorOptions,
    );
  }
}

export function toJsonSchema<T extends AnySchemaLike>(
  schema: T,
  options?: Partial<Options>,
): SchemaObject {
  console.log('Input schema type:', schema?.constructor?.name);
  validateSchema(schema);

  // Handle both ZodType and raw SchemaObject
  const convertToJsonSchema = (inputSchema: AnySchemaLike): SchemaObject => {
    // Check if it's a Zod object by looking for _def and typeName
    if (inputSchema && typeof inputSchema === 'object' && '_def' in inputSchema && 
        (inputSchema as any)._def?.typeName?.startsWith('Zod')) {
      console.log('Converting Zod schema to JSON Schema');
      const converted = zodToJsonSchema(inputSchema as ZodType, {
        ...options,
        target: "jsonSchema7",
        errorMessages: true,
      });
      console.log('Converted schema:', JSON.stringify(converted, null, 2));
      return converted;
    }
    console.log('Using raw schema object');
    return inputSchema;
  };

  const jsonSchema = convertToJsonSchema(schema);

  // Ensure schema has proper structure
  if (typeof jsonSchema === "object" && jsonSchema !== null) {
    const schemaObj = jsonSchema as SchemaObject & {
      properties?: Record<string, unknown>;
      required?: string[];
      type?: string;
    };

    // Handle required fields for objects
    if (schemaObj.type === "object" || schemaObj.properties) {
      if (!schemaObj.required) {
        schemaObj.required = [];
      } else if (!Array.isArray(schemaObj.required)) {
        schemaObj.required = Object.keys(schemaObj.properties || {});
      }
    }

    // Ensure all nested objects also have proper required arrays
    if (schemaObj.properties) {
      Object.entries(schemaObj.properties).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          schemaObj.properties![key] = toJsonSchema(value as AnySchemaLike);
        }
      });
    }
  }

  return jsonSchema;
}

export function createSchemaValidator<T extends AnySchemaLike>(
  schema: T,
  options?: AjvOptions,
): ValidateFunction<FromSchemaLike<T>> {
  console.log('Creating schema validator');
  const jsonSchema = toJsonSchema(schema);
  console.log('Schema for validation:', JSON.stringify(jsonSchema, null, 2));

  const ajv = new Ajv({
    coerceTypes: "array",
    useDefaults: true,
    strict: false,
    strictSchema: false,
    strictTuples: true,
    strictNumbers: true,
    strictTypes: true,
    strictRequired: true,
    parseDate: true,
    allowDate: true,
    allowUnionTypes: true,
    ...options,
  });
  console.log('Ajv options:', {
    coerceTypes: "array",
    useDefaults: true,
    strict: false,
    strictSchema: false,
    strictTuples: true,
    strictNumbers: true,
    strictTypes: true,
    strictRequired: true,
    parseDate: true,
    allowDate: true,
    allowUnionTypes: true,
    ...options,
  });
  
  addFormats.default(ajv);
  try {
    const validator = ajv.compile<FromSchemaLike<T>>(jsonSchema);
    console.log('Validator compiled successfully');
    return validator;
  } catch (error) {
    console.error('Error compiling schema:', error);
    throw error;
  }
}

interface ParseBrokenJsonOptions {
  pair?: [string, string] | null;
}
export function parseBrokenJson(input: string | undefined, options?: ParseBrokenJsonOptions) {
  input = (input ?? "")?.trim();

  try {
    try {
      return JSON.parse(input);
    } catch {
      const pair = options?.pair;
      if (pair) {
        const { outer } = findFirstPair(input, pair) ?? { outer: input };
        return JSON.parse(jsonrepair(outer));
      } else {
        return JSON.parse(jsonrepair(input));
      }
    }
  } catch {
    return null;
  }
}
