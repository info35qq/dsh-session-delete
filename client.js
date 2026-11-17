window.__ModuleLoader__.load({
  id: '@local/dsh-session-delete',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // Baseline external in the module-loader lane; the plain button below is the fallback.
    let primitives
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    } catch {
      primitives = undefined
    }
    const MenuItemButton = primitives === undefined ? undefined : primitives.MenuItemButton

    const NS = 'session-delete'

    const en = {
      'menu.delete': 'Delete this session…',
      'menu.confirm': 'Click again to delete permanently',
      'menu.confirmHint': 'Deletes the stored log of “{title}”. This cannot be undone.',
      'menu.busy': 'Deleting…',
      'menu.failed': 'Delete failed: {message}',
    }

    const zh = {
      'menu.delete': '删除该会话…',
      'menu.confirm': '再点一次：永久删除',
      'menu.confirmHint': '将删除“{title}”存储的会话日志，此操作不可撤销。',
      'menu.busy': '正在删除…',
      'menu.failed': '删除失败：{message}',
    }

    /** @param {string} key - dictionary key. @param {object} params - interpolation values. */
    function fallbackText(key, params) {
      const dictionary = (navigator.language || '').toLowerCase().startsWith('zh') ? zh : en
      let text = dictionary[key] ?? zh[key] ?? key
      for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
      return text
    }

    function SessionDeleteItem(props) {
      const { sessionId, displayTitle, t, deleteSession, useMenuOpenState } = props
      const [, setMenuOpen] = useMenuOpenState()
      const [phase, setPhase] = React.useState('idle')
      const [reason, setReason] = React.useState('')

      React.useEffect(() => {
        if (phase !== 'failed') return undefined
        const timer = setTimeout(() => { setPhase('idle'); setReason('') }, 6000)
        return () => { clearTimeout(timer) }
      }, [phase])

      const tr = (key, params) => {
        if (typeof t === 'function') {
          const text = t(key, params)
          if (typeof text === 'string' && text.length > 0 && text !== key) return text
        }
        return fallbackText(key, params)
      }

      const activate = () => {
        if (phase === 'busy') return
        if (phase !== 'confirm') {
          setPhase('confirm')
          return
        }
        setPhase('busy')
        void Promise.resolve(deleteSession(sessionId)).then((outcome) => {
          if (outcome?.ok === true) {
            setMenuOpen(false)
            return
          }
          setPhase('failed')
          setReason(outcome?.message ?? 'unknown error')
        }, (error) => {
          setPhase('failed')
          setReason(error?.message ?? String(error))
        })
      }

      const text = phase === 'confirm'
        ? tr('menu.confirm')
        : phase === 'busy'
          ? tr('menu.busy')
          : phase === 'failed'
            ? tr('menu.failed', { message: reason })
            : tr('menu.delete')
      const title = phase === 'confirm' ? tr('menu.confirmHint', { title: displayTitle }) : undefined
      const ariaLabel = tr('menu.delete')

      if (MenuItemButton !== undefined) {
        return h(MenuItemButton, {
          separatorBefore: true, onSelect: activate, title, 'aria-label': ariaLabel,
        }, text)
      }
      return h('button', {
        type: 'button',
        role: 'menuitem',
        onClick: activate,
        title,
        'aria-label': ariaLabel,
        style: { display: 'block', width: '100%', padding: '6px 10px', textAlign: 'start', background: 'transparent', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' },
      }, text)
    }

    return {
      name: 'session-delete-client',
      inject: ['slots', 'locale', 'remote', 'remote.commands', 'sessions'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'session-delete: locale')

        /**
         * Run the Host command from the Session the user currently has open: the
         * command writes its lifecycle events into that Session's log, and an
         * archived target owns no live agent to receive it.
         * @param {string} targetId - the archived Session to delete.
         */
        const deleteSession = async (targetId) => {
          let current
          try {
            const snapshot = ctx.sessions.list.getSnapshot()
            current = Object.values(snapshot.byId ?? {}).find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id
          } catch {
            current = undefined
          }
          if (current === undefined) return { ok: false, message: '请先打开一个会话，再删除其它会话。' }
          if (current === targetId) return { ok: false, message: '请先切换到其它会话，再删除这个会话。' }

          const result = await ctx.remote.commands.execute(current, `/delete-session ${targetId}`, [])
          if (result?.ok !== true) return { ok: false, message: result?.error?.message ?? '命令执行失败' }
          const execution = result.value
          if (execution === undefined) return { ok: false, message: '宿主没有注册 /delete-session 命令。' }
          const outcome = execution.result
          if (outcome?.kind !== 'success') return { ok: false, message: outcome?.text ?? '删除失败' }

          try { await ctx.sessions.refresh() } catch { /* the row is gone from disk either way */ }
          return { ok: true, message: outcome.text ?? '' }
        }

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'session-delete',
          order: 550,
          locale: NS,
          inject: () => ({ deleteSession }),
        }, SessionDeleteItem))
      },
    }
  },
})