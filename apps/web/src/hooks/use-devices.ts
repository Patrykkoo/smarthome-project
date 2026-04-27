import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = 'http://192.168.0.66:3000/api';

export interface Device {
    id: string;
    friendly_name: string;
    last_seen: string;
    exposes: any;
    last_payload?: any;
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