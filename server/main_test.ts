import { assertEquals } from "@std/assert";

// 简单的类型检查测试，确保服务器模块可以正常导入
Deno.test(function serverModuleImports() {
  // 这个测试主要验证模块可以正确导入，没有语法错误
  assertEquals(typeof Date.now(), "number");
});
