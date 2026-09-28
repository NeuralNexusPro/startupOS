/**
 * 前端调试问题排查报告
 *
 * 问题：页面控制台一直在刷，页面不停刷新
 *
 * 检查结果：
 * 1. Next.js 开发服务器正常运行
 * 2. API 请求正常响应（GET / 和 GET /api/projects）
 * 3. 编译正常（360 modules）
 * 4. 没有检测到频繁的重复请求（只有 4 个 GET 请求）
 *
 * 已修复的问题：
 * 1. useProjects hook 中 baseQuery 的无限循环（使用 useMemo 缓存）
 */

import { useState, useCallback, useEffect, useMemo } from "react";

// 问题根源：loadProjects 在每次渲染时都会重新创建，
// 因为 baseQuery 对象引用在每次渲染时都是新的
// 导致 useEffect 检测到函数变化，无限重新调用

export function useProjects(options: UseProjectsOptions = {}): UseProjectsReturn {
  const {
    query: baseQuery = {}, // ❌ 问题：每次渲染都是新对象
    refreshInterval = DEFAULT_REFRESH_INTERVAL,
  } = options;

  const loadProjects = useCallback(async (queryOverride?: ProjectQuery) => {
    // ...
  }, [baseQuery]); // ❌ 问题：依赖 baseQuery 对象引用

  useEffect(() => {
    refreshProjects();
  }, [refreshInterval]);
}

// ✅ 修复方案：使用 useMemo 缓存对象引用
export function useProjects(options: UseProjectsOptions = {}): UseProjectsReturn {
  const {
    query: baseQuery = {},
    refreshInterval = DEFAULT_REFRESH_INTERVAL,
  } = options;

  const memoizedBaseQuery = useMemo(
    () => baseQuery,
    [JSON.stringify(baseQuery)]  // 只有内容变化时才更新
  );

  const loadProjects = useCallback(async (queryOverride?: ProjectQuery) => {
    // ...
  }, [memoizedBaseQuery]); // ✅ 引用保持稳定

  useEffect(() => {
    refreshProjects();
  }, [refreshInterval, loadProjects]); // ✅ 避免 baseQuery 变化
}
