import { useState } from 'react'

interface AttachmentCardProps {
   file: File
   onRemove: () => void
   onClick: () => void
}

export default function AttachmentCard({ file, onRemove, onClick }: AttachmentCardProps) {
   const [thumbnail, setThumbnail] = useState<string | null>(null)

   const isMedia = file.type.startsWith('image/') || file.type.startsWith('video/')
   const isPDF = file.type === 'application/pdf'
   const isText = file.type.startsWith('text/') || file.name.endsWith('.ts') || file.name.endsWith('.tsx') || file.name.endsWith('.py') || file.name.endsWith('.json') || file.name.endsWith('.md')

   // Generate thumbnail for media files
   if (isMedia && !thumbnail) {
      const reader = new FileReader()
      reader.onload = (e) => setThumbnail(e.target?.result as string)
      reader.readAsDataURL(file)
   }

   // Truncate filename
   const displayName = file.name.length > 24
      ? file.name.slice(0, 21) + '...'
      : file.name

   return (
      <div
         className="flex items-center gap-3 bg-[#28292A] rounded-lg px-3 py-2 min-w-[200px] max-w-[280px] cursor-pointer hover:bg-[#333] transition-colors group relative"
         onClick={onClick}
      >
         {/* Thumbnail or Icon */}
         <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-[#1E1F20] flex items-center justify-center">
            {isMedia && thumbnail ? (
               <img src={thumbnail} alt="" className="w-full h-full object-cover" />
            ) : isPDF ? (
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF4D4D" strokeWidth="2">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
               </svg>
            ) : isText ? (
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8C7FA" strokeWidth="2">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                  <line x1="9" y1="16" x2="13" y2="16" />
               </svg>
            ) : (
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
               </svg>
            )}
         </div>

         {/* File Info */}
         <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-300 truncate">{displayName}</div>
            <div className="text-xs text-gray-500">Ready</div>
         </div>

         {/* Remove Button */}
         <button
            onClick={(e) => {
               e.stopPropagation()
               onRemove()
            }}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#444] hover:bg-[#555] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
         >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
               <line x1="18" y1="6" x2="6" y2="18" />
               <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
         </button>
      </div>
   )
}
