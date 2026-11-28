/**
 * @module @spark-appworks/spark-ai:class-model/class-model/schema/class-model-declaration-schema
 * 职责：从 TypeScript 已解析类型投影数据声明，保留联合、交叉和映射类型的字段约束。
 * 边界：仅用于编译期；命名数据引用交给 bundle 寻址，不执行领域逻辑。
 * AI用途：保证声明中的必填、可选与组合约束进入脚本参数校验。
 */
import ts from 'typescript'
import { dirname, resolve } from 'node:path'
import type { JsonSchema, JsonSchemaObject } from '@spark-appworks/spark-json-document'
import { isPrivateMember } from '../declaration/dts-ast-utils'
import { extractConstOrSingleEnumValue } from './json-schema-emit'

type DeclarationLiteral = string | number | boolean | null

/** 类型别名的数据形状投影；访问属性是否只读不改变输入是否必填。 */
export class ClassModelDeclarationSchema {
  private readonly targets = new WeakMap<JsonSchemaObject, ts.Declaration>()
  private readonly unlinked = new WeakMap<JsonSchemaObject, JsonSchema>()
  private readonly checker: ts.TypeChecker
  private readonly aliasSymbols = new Map<ts.Type, Set<ts.Symbol>>()
  /** 使用生成阶段已有的类型检查器。 */
  public constructor(private readonly program: ts.Program) {
    this.checker = program.getTypeChecker()
    for (const source of program.getSourceFiles()) {
      if (program.isSourceFileDefaultLibrary(source)) continue
      for (const node of source.statements) {
        if (!ts.isTypeAliasDeclaration(node) || node.typeParameters?.length) continue
        const type = this.checker.getTypeAtLocation(node)
        const symbol = this.checker.getSymbolAtLocation(node.name)
        if (symbol === undefined) continue
        const symbols = this.aliasSymbols.get(type)
        if (symbols === undefined) this.aliasSymbols.set(type, new Set([symbol]))
        else symbols.add(symbol)
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

  /** 在当前投影实例内保留声明与原始 Schema 节点；标准化后的文档没有编译器对象。 */
  public registerTypeAliasBody(document: JsonSchemaObject, body: JsonSchema): void {
    this.unlinked.set(document, body)
  }

  /** 供 bundle 在标准化复制子节点前从源 Schema 生成有声明证明的链接。 */
  public typeAliasBody(document: JsonSchemaObject): JsonSchema | undefined {
    return this.unlinked.get(document)
  }

  /** 返回此占位节点在构建程序中指向的具体声明。 */
  public referenceDeclaration(node: JsonSchemaObject): ts.Declaration | undefined {
    return this.targets.get(node)
  }

  private referenceSchema(title: string, declaration: ts.Declaration): JsonSchemaObject {
    const schema = {type: 'object', title} as const
    this.targets.set(schema, declaration)
    return schema
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
    const alias = expand ? undefined : this.declaredAlias(type, site)
    if (alias !== undefined) return alias
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
      return this.referenceSchema(this.checker.typeToString(type, site, ts.TypeFormatFlags.NoTruncation), namedDeclaration)
    }
    if (type.isUnion()) {
      const branches = type.types.filter(part => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)))
        .map(part => this.schema(part, site))
      const schemas = this.orderLiteralBranches(branches, site)
      if (schemas.length === 0) return false
      if (schemas.length === 1 && schemas[0] !== undefined) return schemas[0]
      if (schemas.includes(true)) return true
      const values = schemas.map(extractConstOrSingleEnumValue)
      if (values.every(value => value !== undefined)) return {enum: [...new Set(values)]}
      return {anyOf: schemas}
    }
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
      return {type: 'object', title: this.checker.typeToString(type, site)}
    }
    if (!(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))) return true
    return this.objectSchema(type, site)
  }

  /** 只有语法提供了全部实际值的顺序，才排列已投影分支；每个分支和它的值保持原样。 */
  private orderLiteralBranches(branches: JsonSchema[], site: ts.Node): JsonSchema[] {
    const node = ts.isTypeAliasDeclaration(site) ? site.type : site
    if (!ts.isTypeNode(node) || branches.length < 2) return branches
    const byValue = new Map<DeclarationLiteral, JsonSchema[]>()
    for (const branch of branches) {
      const value = typeof branch === 'object' && branch.type === 'null' ? null : extractConstOrSingleEnumValue(branch)
      if (value === undefined) return branches
      const group = byValue.get(value)
      if (group === undefined) byValue.set(value, [branch])
      else group.push(branch)
    }
    const ordered = this.declaredLiteralValues(node)
    if (ordered === undefined) return branches
    const result: JsonSchema[] = []
    for (const value of new Set(ordered)) {
      const group = byValue.get(value)
      if (group === undefined) return branches
      result.push(...group)
    }
    return result.length === branches.length ? result : branches
  }

  private declaredLiteralValues(
    node: ts.TypeNode, omitUniqueSymbols = false, visited = new Set<ts.TypeAliasDeclaration>(),
  ): DeclarationLiteral[] | undefined {
    if (ts.isParenthesizedTypeNode(node)) return this.declaredLiteralValues(node.type, omitUniqueSymbols, visited)
    if (node.kind === ts.SyntaxKind.UndefinedKeyword || node.kind === ts.SyntaxKind.VoidKeyword) return []
    if (ts.isUnionTypeNode(node)) {
      const values: DeclarationLiteral[] = []
      for (const part of node.types) {
        const group = this.declaredLiteralValues(part, omitUniqueSymbols, visited)
        if (group === undefined) return undefined
        values.push(...group)
      }
      return values
    }
    if (omitUniqueSymbols && this.checker.getTypeFromTypeNode(node).flags & ts.TypeFlags.UniqueESSymbol) return []
    if (ts.isIndexedAccessTypeNode(node)) return this.declaredIndexedValues(node, visited)
    if (ts.isTemplateLiteralTypeNode(node)) {
      const [span] = node.templateSpans
      if (node.head.text !== '' || node.templateSpans.length !== 1 || span?.literal.text !== '') return undefined
      return this.declaredLiteralValues(span.type, omitUniqueSymbols, visited)?.map(String)
    }
    if (ts.isTypeReferenceNode(node)) {
      const declarations = this.typeReferenceSymbol(node)?.declarations
      if (declarations?.length !== 1) return undefined
      const [decl] = declarations
      if (decl === undefined) return undefined
      if (ts.isEnumMember(decl)) {
        const value = this.checker.getConstantValue(decl)
        return value === undefined ? undefined : [value]
      }
      if (ts.isTypeAliasDeclaration(decl) && !decl.typeParameters?.length && !visited.has(decl)) {
        return this.declaredLiteralValues(decl.type, omitUniqueSymbols, new Set([...visited, decl]))
      }
      if (!ts.isEnumDeclaration(decl)) return undefined
      const values: DeclarationLiteral[] = []
      for (const member of decl.members) {
        const value = this.checker.getConstantValue(member)
        if (value === undefined) return undefined
        values.push(value)
      }
      return values
    }
    if (!ts.isLiteralTypeNode(node)) return undefined
    if (node.literal.kind === ts.SyntaxKind.NullKeyword) return [null]
    if (node.literal.kind === ts.SyntaxKind.TrueKeyword) return [true]
    if (node.literal.kind === ts.SyntaxKind.FalseKeyword) return [false]
    const value = this.checker.getTypeFromTypeNode(node)
    return value.isStringLiteral() || value.isNumberLiteral() ? [value.value] : undefined
  }

  /** 从原元组或常量对象读取索引值顺序，避免使用编译器折叠后的联合类型顺序。 */
  private declaredIndexedValues(
    node: ts.IndexedAccessTypeNode, visited: Set<ts.TypeAliasDeclaration>,
  ): DeclarationLiteral[] | undefined {
    const objectType = this.checker.getTypeFromTypeNode(node.objectType)
    const index = node.indexType
    if (ts.isLiteralTypeNode(index) && ts.isStringLiteral(index.literal)) {
      return this.declaredIndexedPropertyValues(node.objectType, index.literal.text, visited)
    }
    const values = index.kind === ts.SyntaxKind.NumberKeyword && this.isTuple(objectType)
      ? this.checker.getTypeArguments(objectType)
      : this.declaredObjectValueTypes(node, objectType)
    return values === undefined ? undefined : this.literalsFromTypes(values)
  }

  /** 按联合对象声明顺序读取同名判别字段，实际值仍由编译器解析。 */
  private declaredIndexedPropertyValues(
    node: ts.TypeNode, key: string, visited: Set<ts.TypeAliasDeclaration>,
  ): DeclarationLiteral[] | undefined {
    if (ts.isParenthesizedTypeNode(node)) return this.declaredIndexedPropertyValues(node.type, key, visited)
    if (ts.isUnionTypeNode(node)) {
      const values: DeclarationLiteral[] = []
      for (const branch of node.types) {
        const branchValues = this.declaredIndexedPropertyValues(branch, key, visited)
        if (branchValues === undefined) return undefined
        values.push(...branchValues)
      }
      return values
    }
    if (ts.isTypeReferenceNode(node)) {
      const declaration = this.typeReferenceSymbol(node)?.declarations?.[0]
      if (declaration !== undefined && ts.isTypeAliasDeclaration(declaration) && !declaration.typeParameters?.length) {
        if (visited.has(declaration)) return undefined
        return this.declaredIndexedPropertyValues(declaration.type, key, new Set([...visited, declaration]))
      }
    }
    const property = this.checker.getPropertyOfType(this.checker.getTypeFromTypeNode(node), key)
    if (property === undefined) return undefined
    const value = this.checker.getTypeOfSymbolAtLocation(property, node)
    const defined = value.isUnion()
      ? value.types.filter(part => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)))
      : [value]
    return defined.length === 1 ? this.literalsFromTypes(defined) : undefined
  }

  private literalsFromTypes(values: readonly ts.Type[]): DeclarationLiteral[] | undefined {
    const literals: DeclarationLiteral[] = []
    for (const value of values) {
      if (value.isStringLiteral() || value.isNumberLiteral()) literals.push(value.value)
      else if (value.flags & ts.TypeFlags.BooleanLiteral) literals.push(this.checker.typeToString(value) === 'true')
      else if (value.flags & ts.TypeFlags.Null) literals.push(null)
      else return undefined
    }
    return literals
  }

  private declaredObjectValueTypes(node: ts.IndexedAccessTypeNode, objectType: ts.Type): ts.Type[] | undefined {
    const index = node.indexType
    if (!ts.isTypeQueryNode(node.objectType) || !ts.isTypeOperatorNode(index)
      || index.operator !== ts.SyntaxKind.KeyOfKeyword || !ts.isTypeQueryNode(index.type)
      || this.checker.getIndexInfosOfType(objectType).length > 0) return undefined
    const objectSymbol = this.checker.getSymbolAtLocation(node.objectType.exprName)
    if (objectSymbol === undefined || objectSymbol !== this.checker.getSymbolAtLocation(index.type.exprName)) return undefined
    return this.checker.getPropertiesOfType(objectType).map(property => this.checker.getTypeOfSymbolAtLocation(property, node))
  }

  private declaredAlias(type: ts.Type, site: ts.Node): JsonSchemaObject | undefined {
    const candidates = this.aliasSymbols.get(type)
    if (candidates === undefined) return undefined
    const annotation = ts.isTypeNode(site) ? site : ts.isTypeAliasDeclaration(site) ? site.type : undefined
    if (annotation === undefined) return undefined
    const matches = new Map<ts.Symbol, string>()
    const visit = (node: ts.Node): void => {
      if (ts.isTypeReferenceNode(node)) {
        const symbol = this.checker.getSymbolAtLocation(node.typeName)
        const resolved = symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
          ? this.checker.getAliasedSymbol(symbol) : symbol
        if (resolved !== undefined && candidates.has(resolved) && this.checker.getTypeFromTypeNode(node) === type) {
          matches.set(resolved, node.typeName.getText())
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(annotation)
    const [match] = matches
    if (matches.size !== 1 || match === undefined) return undefined
    const [symbol, spelling] = match
    const declaration = symbol.declarations?.find(ts.isTypeAliasDeclaration)
    return declaration === undefined ? undefined : this.referenceSchema(spelling, declaration)
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
      // JSON 只携带字符串成员名。相同字符串查回其它成员时，当前属性属于独立的符号键。
      if (this.checker.getPropertyOfType(type, property.name) !== property) continue
      const declaration = property.valueDeclaration ?? property.declarations?.[0]
      if (declaration !== undefined && isPrivateMember(declaration)) continue
      const annotation = declaration !== undefined && (ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration))
        ? declaration.type : undefined
      properties[property.name] = this.schema(this.checker.getTypeOfSymbolAtLocation(property, site), annotation ?? site)
      if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name)
    }
    const index = this.checker.getIndexTypeOfType(type, ts.IndexKind.String)
    const additionalProperties = index === undefined ? false : this.schema(index, site)
    // 只调整序列化顺序，保留类型检查器原有的属性与索引求值次序。
    const node = ts.isTypeAliasDeclaration(site) ? site.type : site
    const declaredOrder = ts.isTypeNode(node) ? this.declaredObjectKeyOrder(node) : undefined
    const ranks = new Map(declaredOrder?.map((name, position) => [name, position]))
    const compare = (left: string, right: string) => (ranks.get(left) ?? ranks.size) - (ranks.get(right) ?? ranks.size)
    const orderedProperties = ranks.size === 0 ? properties
      : Object.fromEntries(Object.entries(properties).sort(([left], [right]) => compare(left, right)))
    if (ranks.size > 0) required.sort(compare)
    return {type: 'object', properties: orderedProperties, ...(required.length === 0 ? {} : {required}), additionalProperties}
  }

  /** 能沿正式声明追到键时沿用声明顺序，交叉对象按各部分的声明先后合并。 */
  private declaredObjectKeyOrder(node: ts.TypeNode, visited = new Set<ts.TypeAliasDeclaration>()): string[] | undefined {
    if (ts.isParenthesizedTypeNode(node)) return this.declaredObjectKeyOrder(node.type, visited)
    if (ts.isTypeLiteralNode(node)) return this.objectPropertyNames(node)
    if (ts.isIntersectionTypeNode(node)) {
      const parts = node.types.map(part => this.declaredObjectKeyOrder(part, visited))
      if (parts.every(keys => keys === undefined)) return undefined
      return [...new Set(node.types.flatMap((part, index) => parts[index] ?? this.objectPropertyNames(part)))]
    }
    if (ts.isMappedTypeNode(node) && node.nameType === undefined) return this.literalObjectKeys(node.typeParameter.constraint)
    if (!ts.isTypeReferenceNode(node)) return undefined
    const symbol = this.typeReferenceSymbol(node)
    const declaration = symbol?.declarations?.[0]
    if (symbol === undefined || declaration === undefined) return undefined
    if (!this.program.isSourceFileDefaultLibrary(declaration.getSourceFile())) {
      if (!ts.isTypeAliasDeclaration(declaration) || declaration.typeParameters?.length || visited.has(declaration)) return undefined
      return this.declaredObjectKeyOrder(declaration.type, new Set([...visited, declaration]))
    }
    if (symbol.name === 'Pick') return this.literalObjectKeys(node.typeArguments?.[1])
    if (symbol.name === 'Record') return this.literalObjectKeys(node.typeArguments?.[0])
    const source = node.typeArguments?.[0]
    if (source === undefined || !['Partial', 'Readonly', 'Required', 'Omit'].includes(symbol.name)) return undefined
    const keys = this.declaredObjectKeyOrder(source, visited)
    if (symbol.name !== 'Omit' || keys === undefined) return keys
    const omittedType = this.checker.getTypeFromTypeNode(node)
    return keys.filter(key => this.checker.getPropertyOfType(omittedType, key) !== undefined)
  }

  private typeReferenceSymbol(node: ts.TypeReferenceNode): ts.Symbol | undefined {
    const binding = this.checker.getSymbolAtLocation(node.typeName)
    return binding !== undefined && binding.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(binding) : binding
  }

  private objectPropertyNames(node: ts.TypeNode): string[] {
    return this.checker.getPropertiesOfType(this.checker.getTypeFromTypeNode(node)).map(property => property.name)
  }

  private literalObjectKeys(node: ts.TypeNode | undefined): string[] | undefined {
    const values = node === undefined ? undefined : this.declaredLiteralValues(node, true)
    return values?.every(value => typeof value === 'string' || typeof value === 'number')
      ? [...new Set(values.map(String))]
      : undefined
  }
}
