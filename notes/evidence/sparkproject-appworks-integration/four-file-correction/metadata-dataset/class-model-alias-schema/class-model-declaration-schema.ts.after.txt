/**
 * @module @spark-appworks/spark-ai:class-model/class-model/schema/class-model-declaration-schema
 * 职责：从 TypeScript 已解析类型投影数据声明，保留联合、交叉和映射类型的字段约束。
 * 边界：仅用于编译期；命名数据引用交给 bundle 寻址，不执行领域逻辑。
 * AI用途：保证声明中的必填、可选与组合约束进入脚本参数校验。
 */
import ts from 'typescript'
import { dirname, resolve } from 'node:path'
import type { JsonSchema, JsonSchemaObject } from '@spark-appworks/spark-json-document'
import { extractConstOrSingleEnumValue } from './json-schema-emit'

/** 类型别名的数据形状投影；访问属性是否只读不改变输入是否必填。 */
export class ClassModelDeclarationSchema {
  private readonly checker: ts.TypeChecker
  private readonly names = new Map<ts.Type, string>()
  /** 使用生成阶段已有的类型检查器。 */
  public constructor(program: ts.Program) {
    this.checker = program.getTypeChecker()
    for (const source of program.getSourceFiles()) {
      if (program.isSourceFileDefaultLibrary(source)) continue
      for (const node of source.statements) {
        if (!ts.isTypeAliasDeclaration(node) || node.typeParameters?.length) continue
        const type = this.checker.getTypeAtLocation(node)
        if (!this.names.has(type)) this.names.set(type, node.name.text)
      }
    }
  }

  /** 同一编译程序解析磁盘或内存声明间的引用，保留严格空值语义。 */
  public static createProgram(rootFiles: readonly string[], host?: ts.CompilerHost): ts.Program {
    const directories = new Set<string>()
    for (const file of rootFiles) {
      let directory = dirname(resolve(file))
      while (!directories.has(directory)) {
        directories.add(directory)
        directory = dirname(directory)
      }
    }
    // 内存 emit 的文件没有物理目录；模块解析仍须能访问这些目录中的同级声明。
    const programHost = host === undefined ? undefined : {...host,
      directoryExists: (path: string) => directories.has(resolve(path)) || (host.directoryExists?.(path) ?? ts.sys.directoryExists(path)),
    }
    return ts.createProgram({rootNames: [...rootFiles], options: {
      strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    }, ...(programHost === undefined ? {} : {host: programHost})})
  }

  /** 投影已绑定到当前编译程序的类型别名，失败时报告声明位置。 */
  public project(node: ts.TypeAliasDeclaration): JsonSchema {
    try {
      return this.schema(this.checker.getTypeAtLocation(node), node, true)
    } catch (cause) {
      throw new Error(`Cannot project declaration ${node.name.text} in ${node.getSourceFile().fileName}`, {cause})
    }
  }

  private schema(type: ts.Type, site: ts.Node, expand = false): JsonSchema {
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) return true
    if (type.flags & (ts.TypeFlags.Never | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) return false
    if (type.isStringLiteral()) return {type: 'string', enum: [type.value]}
    if (type.isNumberLiteral()) return {type: 'number', enum: [type.value]}
    if (type.flags & ts.TypeFlags.String) return {type: 'string'}
    if (type.flags & ts.TypeFlags.Number) return {type: 'number'}
    if (type.flags & ts.TypeFlags.BooleanLiteral) return {type: 'boolean', enum: [this.checker.typeToString(type) === 'true']}
    if (type.flags & ts.TypeFlags.Null) return {type: 'null'}
    const aliasName = this.names.get(type)
    if (!expand && aliasName !== undefined) return {type: 'object', title: aliasName}
    if (this.isTuple(type)) return this.tupleSchema(type, site)
    if (this.checker.isArrayType(type) || type.getSymbol()?.name === 'ReadonlyArray') {
      const element = this.checker.getIndexTypeOfType(type, ts.IndexKind.Number)
      return {type: 'array', items: element === undefined ? true : this.schema(element, site)}
    }

    const symbol = type.aliasSymbol ?? type.getSymbol()
    const namedDeclaration = symbol?.declarations?.find(declaration =>
      ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration) || ts.isClassDeclaration(declaration))
    if (!expand && namedDeclaration !== undefined && !(ts.isTypeAliasDeclaration(namedDeclaration)
      && /[/\\]lib\.[^/\\]+\.d\.ts$/u.test(namedDeclaration.getSourceFile().fileName))) {
      return {type: 'object', title: this.checker.typeToString(type, site, ts.TypeFormatFlags.NoTruncation)}
    }
    if (type.isUnion()) {
      const schemas = type.types.filter(part => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)))
        .map(part => this.schema(part, site))
      if (schemas.length === 0) return false
      if (schemas.length === 1 && schemas[0] !== undefined) return schemas[0]
      if (schemas.includes(true)) return true
      const values = schemas.map(extractConstOrSingleEnumValue)
      if (values.every(value => value !== undefined)) return {enum: values}
      return {anyOf: schemas}
    }
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
      return {type: 'object', title: this.checker.typeToString(type, site)}
    }
    if (!(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))) return true
    return this.objectSchema(type, site)
  }

  private isTuple(type: ts.Type): type is ts.TupleTypeReference {
    return this.checker.isTupleType(type)
  }

  private tupleSchema(type: ts.TupleTypeReference, site: ts.Node): JsonSchemaObject {
    const elements = this.checker.getTypeArguments(type)
    const prefixItems = elements.slice(0, type.target.fixedLength).map(element => this.schema(element, site))
    const rest = elements[type.target.fixedLength]
    return {type: 'array', prefixItems, minItems: type.target.minLength,
      ...(rest === undefined ? {maxItems: elements.length, items: false} : {items: this.schema(rest, site)})}
  }

  private objectSchema(type: ts.Type, site: ts.Node): JsonSchemaObject {
    const properties: Record<string, JsonSchema> = {}
    const required: string[] = []
    for (const property of this.checker.getPropertiesOfType(type)) {
      properties[property.name] = this.schema(this.checker.getTypeOfSymbolAtLocation(property, site), site)
      if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name)
    }
    const index = this.checker.getIndexTypeOfType(type, ts.IndexKind.String)
    return {type: 'object', properties, ...(required.length === 0 ? {} : {required}),
      additionalProperties: index === undefined ? false : this.schema(index, site)}
  }
}
