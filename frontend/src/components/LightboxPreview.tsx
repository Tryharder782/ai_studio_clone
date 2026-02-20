import { useEffect, useState } from 'react'

interface PreviewData {
   name: string
   type: string
   url: string
   size: number
}

interface LightboxPreviewProps {
   data: PreviewData | null
   onClose: () => void
}

export default function LightboxPreview({ data, onClose }: LightboxPreviewProps) {
   const [textContent, setTextContent] = useState<string | null>(null)

   // Close on Escape key
   useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
         if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
   }, [onClose])

   useEffect(() => {
      if (data && (data.type.startsWith('text/') || data.name.endsWith('.ts') || data.name.endsWith('.tsx') || data.name.endsWith('.py') || data.name.endsWith('.json') || data.name.endsWith('.md'))) {
         fetch(data.url)
            .then(res => res.text())
            .then(setTextContent)
            .catch(console.error)
      } else {
         setTextContent(null)
      }
   }, [data])

   if (!data) return null

   const isImage = data.type.startsWith('image/')
   const isVideo = data.type.startsWith('video/')
   const isPDF = data.type === 'application/pdf'
   const isText = textContent !== null

   return (
      <div
         className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 md:p-12"
         onClick={onClose}
      >
         {/* Close Button */}
         <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-[70]"
            onClick={onClose}
         >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
               <line x1="18" y1="6" x2="6" y2="18" />
               <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
         </button>

         {/* Content container */}
         <div
            className="w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
         >
            {isImage && (
               <img
                  src={data.url}
                  alt={data.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
               />
            )}
            {isVideo && (
               <video
                  src={data.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-full rounded-lg shadow-2xl"
               />
            )}
            {isPDF && (
               <div className="w-full h-full max-w-5xl bg-white rounded-lg overflow-hidden flex flex-col shadow-2xl">
                  <div className="bg-[#1E1F20] px-4 py-2 flex items-center justify-between text-white border-b border-[#333]">
                     <span className="text-sm font-medium truncate">{data.name}</span>
                     <span className="text-xs text-gray-400">PDF Viewer</span>
                  </div>
                  <iframe
                     src={data.url}
                     className="flex-1 border-none bg-gray-100"
                     title={data.name}
                  />
               </div>
            )}
            {isText && (
               <div className="w-full h-full max-w-5xl bg-[#0D0D0D] rounded-lg overflow-hidden flex flex-col border border-[#333] shadow-2xl">
                  <div className="bg-[#1E1F20] px-4 py-2 flex items-center justify-between text-white border-b border-[#333]">
                     <span className="text-sm font-medium truncate">{data.name}</span>
                     <span className="text-xs text-gray-400">Source Viewer</span>
                  </div>
                  <div className="flex-1 overflow-auto p-6">
                     <pre className="text-sm text-gray-300 font-mono leading-relaxed whitespace-pre-wrap">
                        {textContent}
                     </pre>
                  </div>
               </div>
            )}
            {!isImage && !isVideo && !isPDF && !isText && (
               <div className="bg-[#28292A] rounded-2xl p-12 text-center max-w-md shadow-2xl border border-[#333]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#A8C7FA" strokeWidth="1.5" className="mx-auto mb-6">
                     <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                     <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div className="text-white text-xl font-bold mb-2">{data.name}</div>
                  <div className="text-gray-400">{(data.size / 1024).toFixed(1)} KB</div>
                  <div className="mt-8">
                     <a
                        href={data.url}
                        download={data.name}
                        className="px-6 py-2 bg-[#A8C7FA] text-[#041E49] rounded-full font-medium hover:bg-[#D3E3FD] transition-colors"
                     >
                        Download File
                     </a>
                  </div>
               </div>
            )}
         </div>
      </div>
   )
}
