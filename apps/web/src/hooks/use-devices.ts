import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export interface Device {
    id: string;
    friendly_name: string;
    last_seen: string;
    exposes: any;
    last_payload?: any;
    room_id?: number | null;
    room_name?: string | null;
}

const fetchDevices = async (): Promise<Device[]> => {
    const { data } = await axios.get(`${API_URL}/devices`);
    return data;
};

export const useDevices = () => {
    return useQuery({
        queryKey: ['devices'],
        queryFn: fetchDevices,
    });
};