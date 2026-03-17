/**
 * Busca Profunda de Chaves em JSON
 * Percorre objetos aninhados e arrays procurando a primeira ocorrência de uma chave.
 */

export function deepSearchKey(obj: unknown, targetKey: string): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return undefined;
  }

  // Se for um array, busca em cada elemento
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = deepSearchKey(item, targetKey);
      if (result !== undefined) return result;
    }
    return undefined;
  }

  // Objeto: verifica se a chave existe neste nível
  const record = obj as Record<string, unknown>;
  if (targetKey in record) {
    return record[targetKey];
  }

  // Busca recursiva em sub-objetos
  for (const key of Object.keys(record)) {
    const result = deepSearchKey(record[key], targetKey);
    if (result !== undefined) return result;
  }

  return undefined;
}

/**
 * Busca múltiplas chaves alternativas e retorna a primeira encontrada.
 * Útil para campos que podem ter nomes diferentes (ex: "phone", "telephone", "celular").
 */
export function deepSearchAny(obj: unknown, keys: string[]): unknown {
  for (const key of keys) {
    const result = deepSearchKey(obj, key);
    if (result !== undefined) return result;
  }
  return undefined;
}
