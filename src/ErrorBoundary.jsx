import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='fixed inset-0 z-[9999] flex items-center justify-center bg-yellow-50 p-8'>
          <div className='max-w-2xl rounded-lg bg-white p-8 shadow-lg'>
            <h2 className='mb-4 text-2xl font-bold text-red-600'>应用出现错误</h2>
            <p className='mb-4 text-gray-700'>
              应用运行时遇到错误，请检查控制台获取详细信息。尝试刷新页面或撤销最近的更改。
            </p>
            {this.state.error && (
              <details className='mb-4'>
                <summary className='mb-2 cursor-pointer font-semibold text-gray-700'>
                  错误详情
                </summary>
                <pre className='overflow-auto rounded bg-gray-100 p-4 text-sm'>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className='rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700'
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
