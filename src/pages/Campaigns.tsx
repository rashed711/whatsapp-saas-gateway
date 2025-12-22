import React from 'react';
import MessageSender from '../components/MessageSender';

interface CampaignsProps {
    socket: any;
}

const Campaigns: React.FC<CampaignsProps> = ({ socket }) => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">إرسال الحملات</h2>
            <MessageSender socket={socket} status="" />
        </div>
    );
};

export default Campaigns;
