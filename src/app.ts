import 'uno.css'

import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { ensureSeedData } from './services/sample'

import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    // 首次启动灌入一张样例图纸，保证首页/详情/查看页开箱即有内容
    try {
      ensureSeedData()
    } catch (err) {
      console.warn('[app] 样例数据初始化失败', err)
    }
  })

  // children 是将要会渲染的页面
  return children
}
  


export default App
