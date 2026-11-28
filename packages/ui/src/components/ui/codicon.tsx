// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/codicon.tsx @ 5688461d

import type * as React from 'react'

import '@vscode/codicons/dist/codicon.css'
import { cn } from '../../lib/utils'

export interface CodiconProps extends React.HTMLAttributes<HTMLElement> {
  name: string
  size?: number | string
  spinning?: boolean
}

export function Codicon({ className, name, size, spinning, style, ...props }: CodiconProps) {
  return (
    <i
      aria-hidden="true"
      className={cn('codicon', `codicon-${name}`, spinning && 'codicon-modifier-spin', className)}
      style={{ ...(size != null && size !== '' ? { fontSize: size } : {}), ...style }}
      {...props}
    />
  )
}
