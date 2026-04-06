export interface VariableDefinition {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'url' | 'email';
  sensitive?: boolean;
}

export type TemplateVariableMap = Record<string, VariableDefinition>;

export interface RenderResult {
  renderedTitle?: string;
  renderedBody: string;
}
