export interface Attachment {
   name: string
   type: string
   size: number
   url: string  // Object URL for preview
}

export interface Message {
   role: 'user' | 'model'
   parts: string[]
   attachments?: Attachment[]
   timestamp?: string
}

export interface ChatState {
   messages: Message[]
}
