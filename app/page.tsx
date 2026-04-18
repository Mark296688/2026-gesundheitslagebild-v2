'use client';

import { MapContainer } from '@/components/map/MapContainer';
import { HospitalLayer } from '@/components/map/HospitalLayer';
import { Header } from '@/components/panels/Header';

export default function Home() {
  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <Header />
      <MapContainer>
        {(map) => <HospitalLayer map={map} />}
      </MapContainer>
    </main>
  );
}
