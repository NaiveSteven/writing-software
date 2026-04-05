/** CSS Module 类型声明 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

/** 普通 CSS 导入 */
declare module '*.css' {}
