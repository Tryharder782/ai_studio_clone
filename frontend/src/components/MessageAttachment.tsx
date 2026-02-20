import { useState, useEffect } from 'react'

interface MessageAttachmentProps {
   name: string
   type: string
   size: number
   url: string
   onClick: () => void
}

export default function MessageAttachment({ name, type, size, url, onClick }: MessageAttachmentProps) {
   const [textSnippet, setTextSnippet] = useState<string | null>(null)

   const isImage = type.startsWith('image/')
   const isVideo = type.startsWith('video/')
   const isPDF = type === 'application/pdf'
   const isText = type.startsWith('text/') || name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.py') || name.endsWith('.json') || name.endsWith('.md')

   const formatSize = (bytes: number) => {
      if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${bytes} B`
   }

   useEffect(() => {
      if (isText && url) {
         fetch(url)
            .then(res => res.text())
            .then(text => {
               setTextSnippet(text.slice(0, 800))
            })
            .catch(err => console.error("Error fetching text snippet:", err))
      }
   }, [isText, url])

   // Truncate filename
   const displayName = name.length > 30 ? name.slice(0, 27) + '...' : name

   if (isImage) {
      return (
         <div
            className="rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity max-w-md border border-[#333]"
            onClick={onClick}
         >
            <img
               src={url}
               alt={name}
               className="max-w-full max-h-[400px] object-contain rounded-xl"
            />
         </div>
      )
   }

   if (isVideo) {
      return (
         <div className="rounded-xl overflow-hidden max-w-md border border-[#333]">
            <video
               src={url}
               controls
               className="max-w-full max-h-[400px] rounded-xl"
            />
         </div>
      )
   }

   // PDF Preview
   if (isPDF) {
      return (
         <div
            className="bg-[#1E1F20] rounded-xl overflow-hidden max-w-md cursor-pointer hover:border-gray-500 transition-colors border border-[#333]"
            onClick={onClick}
         >
            <div className="bg-white h-[250px] relative overflow-hidden pointer-events-none">
               <div className="absolute inset-0 overflow-hidden">
                  <iframe
                     src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                     className="border-none"
                     style={{
                        width: 'calc(100% + 20px)',
                        height: '100%',
                        marginLeft: '0px'
                     }}
                     scrolling="no"
                     title={name}
                  />
               </div>
               <div className="absolute inset-0 bg-transparent" /> {/* Overlay to capture clicks */}
            </div>
            <div className="flex items-center gap-3 px-4 py-3 border-t border-[#333]">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8C7FA" strokeWidth="2">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
               </svg>
               <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{displayName}</div>
               </div>
               <div className="text-xs text-gray-400">{formatSize(size)}</div>
            </div>
         </div>
      )
   }

   // Text Preview
   if (isText) {
      return (
         <div
            className="bg-[#1E1F20] rounded-xl overflow-hidden max-w-md cursor-pointer hover:border-gray-500 transition-colors border border-[#333]"
            onClick={onClick}
         >
            <div className="p-4 bg-[#0D0D0D] h-[200px] relative overflow-hidden">
               <pre className="text-[10px] text-gray-400 font-mono leading-tight whitespace-pre-wrap break-all">
                  {textSnippet || "Loading snippet..."}
               </pre>
               <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0D0D0D] to-transparent pointer-events-none" />
            </div>
            <div className="flex items-center gap-3 px-4 py-3 border-t border-[#333] bg-[#1E1F20]">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8C7FA" strokeWidth="2">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
               </svg>
               <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{displayName}</div>
               </div>
               <div className="text-xs text-gray-400">{formatSize(size)}</div>
            </div>
         </div>
      )
   }

   // Other document
   return (
      <div
         className="bg-[#1E1F20] rounded-xl overflow-hidden max-w-sm cursor-pointer hover:bg-[#28292A] transition-colors border border-[#333]"
         onClick={onClick}
      >
         <div className="bg-[#1E1F20] p-8 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5">
               <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
               <polyline points="14 2 14 8 20 8" />
            </svg>
         </div>
         <div className="flex items-center gap-3 px-4 py-3 border-t border-[#333]">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8C7FA" strokeWidth="2">
               <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
               <polyline points="14 2 14 8 20 8" />
            </svg>
            <div className="flex-1 min-w-0">
               <div className="text-sm text-white truncate">{displayName}</div>
            </div>
            <div className="text-xs text-gray-400">{formatSize(size)}</div>
         </div>
      </div>
   )
}
