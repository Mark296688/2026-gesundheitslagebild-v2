'use client';

import { MapContainer } from '@/components/map/MapContainer';
import { HospitalLayer } from '@/components/map/HospitalLayer';
import { IncidentLayer } from '@/components/map/IncidentLayer';
import { RouteLayer } from '@/components/map/RouteLayer';
import { PlannedIntakeLayer } from '@/components/map/PlannedIntakeLayer';
import { Header } from '@/components/panels/Header';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { IncidentLauncher } from '@/components/panels/IncidentLauncher';
import { PlannedIntakeForm } from '@/components/panels/PlannedIntakeForm';

export default function Home() {
  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <Header />
      <MapContainer>
        {(map) => (
          <>
            <HospitalLayer map={map} />
            <RouteLayer map={map} />
            <IncidentLayer map={map} />
            <PlannedIntakeLayer map={map} />
          </>
        )}
      </MapContainer>
      <LeftPanel>
        <IncidentLauncher />
        <div style={{ height: 1, background: 'var(--border-1)' }} />
        <PlannedIntakeForm />
      </LeftPanel>
    </main>
  );
}
