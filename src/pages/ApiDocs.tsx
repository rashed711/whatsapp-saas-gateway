import React from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

const ApiDocs: React.FC = () => {
    const [copied, setCopied] = useState(false);
    const token = "sk_live_51x884s...9s8d9s8d"; // Mock 

    const copyToken = () => {
        navigator.clipboard.writeText(token);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6 max-w-4xl">
            <h2 className="text-2xl font-bold text-slate-800">معلومات الربط البرمجي (API)</h2>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-700 mb-4">مفتاح الوصول (API Token)</h3>
                <div className="flex items-center gap-2 bg-slate-100 p-3 rounded-xl border border-slate-200">
                    <code className="flex-1 font-mono text-slate-600 truncate">{token}</code>
                    <button onClick={copyToken} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-500">
                        {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                    </button>
                </div>
                <p className="text-xs text-slate-400 mt-2 font-bold">⚠️ لا تشارك هذا المفتاح مع أي شخص.</p>
            </div>

            <div className="bg-slate-900 text-slate-300 p-6 rounded-2xl font-mono text-sm overflow-hidden direction-ltr text-left" dir="ltr">
                <div className="flex items-center gap-2 text-emerald-400 mb-4 border-b border-slate-700 pb-2">
                    <Terminal size={18} />
                    <span className="font-bold">cURL Example</span>
                </div>
                <pre className="overflow-x-auto">
                    {`curl -X POST http://localhost:3050/send-message \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '{
    "numbers": ["9665xxxxxxxx"],
    "type": "text",
    "content": "Hello World!"
  }'`}
                </pre>
            </div>
        </div>
    );
};

import { useState } from 'react';
export default ApiDocs;
