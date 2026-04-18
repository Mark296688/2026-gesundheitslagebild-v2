'use client';

import { MapContainer } from '@/components/map/MapContainer';
import { HospitalLayer } from '@/components/map/HospitalLayer';
import { IncidentLayer } from '@/components/map/IncidentLayer';
import { Header } from '@/components/panels/Header';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { IncidentLauncher } from '@/components/panels/IncidentLauncher';

export default function Home() {
  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <Header />
      <MapContainer>
        {(map) => (
          <>
            <HospitalLayer map={map} />
            <IncidentLayer map={map} />
          </>
        )}
      </MapContainer>
      <LeftPanel>
        <IncidentLauncher />
      </LeftPanel>
    </main>
  );
}
