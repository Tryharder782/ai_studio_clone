
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface ThoughtProcessProps {
   content: string
}

export default function ThoughtProcess({ content }: ThoughtProcessProps) {
   const [isExpanded, setIsExpanded] = useState(false)

   return (
      <div className="w-full my-4 rounded-xl overflow-hidden bg-[#1E1F20] border border-[#333]">
         {/* Header - Always visible */}
         <div
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#2A2B2D] transition-colors select-none"
         >
            <div className="flex items-center gap-2 text-[#A8C7FA]">
               <span className="text-lg">✨</span>
               <span className="font-medium text-sm">Thoughts</span>
            </div>

            <div className="text-gray-400">
               {isExpanded ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                     <path d="m18 15-6-6-6 6" />
                  </svg>
               ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                     <path d="m6 9 6 6 6-6" />
                  </svg>
               )}
            </div>
         </div>

         {/* Content - Collapsible */}
         {isExpanded && (
            <div className="px-4 pb-4 pt-0 border-t border-[#333]/50">
               <div className="prose prose-invert prose-sm max-w-none text-left leading-relaxed text-gray-300
                  break-words whitespace-pre-wrap
                  prose-p:my-2 prose-ul:my-2 prose-li:my-1
                  prose-headings:text-gray-200 prose-headings:font-medium prose-headings:text-sm prose-headings:uppercase prose-headings:tracking-wider prose-headings:mt-4 prose-headings:mb-2
                  ">
                  <ReactMarkdown>
                     {content}
                  </ReactMarkdown>
               </div>

               <div
                  onClick={() => setIsExpanded(false)}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-300 cursor-pointer text-center py-1"
               >
                  Collapse to hide model thoughts ^
               </div>
            </div>
         )}
      </div>
   )
}
