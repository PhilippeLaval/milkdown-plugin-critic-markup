export interface CriticMarkupOptions {
  authorId: string
  enableFloatingToolbar: boolean
  enableSidebar: boolean
  onChange?: (event: CriticChangeEvent) => void
}

export interface CriticChangeEvent {
  type: 'accept' | 'reject'
  markType: 'insert' | 'delete' | 'highlight' | 'comment' | 'substitute'
  from: number
  to: number
  text: string
}

export interface CriticChange {
  id: string
  type: 'insert' | 'delete' | 'highlight' | 'comment' | 'substitute'
  text: string
  comment?: string
  authorId: string
  resolved: boolean
  from: number
  to: number
}

export interface CriticThread {
  threadId: string
  anchorText: string
  resolved: boolean
  resolvedBy?: string
  resolvedAt?: number
  comments: CriticThreadComment[]
}

export interface CriticThreadComment {
  commentId: string
  threadId: string
  parentCommentId?: string
  authorId: string
  authorDisplayName: string
  body: string
  createdAt: number
  editedAt?: number
  reactions?: Record<string, string[]>
}

export interface CriticThreadsConfig {
  onThreadsChange?: (threads: Map<string, CriticThread>) => void
  initialThreads?: Map<string, CriticThread>
}
