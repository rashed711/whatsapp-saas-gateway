import React from 'react';
import MessageSender from '../components/MessageSender';

interface CampaignsProps {
    socket: any;
    status: string;
}

const Campaigns: React.FC<CampaignsProps> = ({ socket, status }) => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">إرسال الحملات</h2>
            <MessageSender socket={socket} status={status} />
        </div>
    );
};

export default Campaigns;
