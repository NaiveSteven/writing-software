import './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

/* 挂载 React 应用到 DOM */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
