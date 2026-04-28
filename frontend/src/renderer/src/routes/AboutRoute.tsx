import { Link } from '@tanstack/react-router'

export function AboutRoute(): React.JSX.Element {
  return (
    <main className="page-center">
      <div className="page-center__content">
        <div className="creator">TanStack Router</div>
        <div className="text">This is a regular code-based route in your Electron app.</div>
        <p className="tip">
          Current route: <code>/about</code>
        </p>
        <div className="actions">
          <div className="action">
            <Link to="/">Go Home</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
