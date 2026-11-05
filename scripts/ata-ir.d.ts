// ata-validator/ir ships no declarations up to 1.63.1; the one call this
// template makes, until the package carries its own.
declare module 'ata-validator/ir' {
  export function tablePlan(schema: unknown, options?: { richErrors?: boolean; assertFormat?: boolean; useDefaults?: boolean }): object | null
}
