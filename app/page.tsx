'use client';

import { MapContainer } from '@/components/map/MapContainer';
import { HospitalLayer } from '@/components/map/HospitalLayer';
import { IncidentLayer } from '@/components/map/IncidentLayer';
import { RouteLayer } from '@/components/map/RouteLayer';
import { PlannedIntakeLayer } from '@/components/map/PlannedIntakeLayer';
import { MapLegend } from '@/components/map/MapLegend';
import { Header } from '@/components/panels/Header';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { IncidentLauncher } from '@/components/panels/IncidentLauncher';
import { PlannedIntakeForm } from '@/components/panels/PlannedIntakeForm';
import { FilterPanel } from '@/components/panels/FilterPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { TimelineStrip } from '@/components/panels/TimelineStrip';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function Home() {
  useKeyboardShortcuts();
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
        <div style={{ height: 1, background: 'var(--border-1)' }} />
        <FilterPanel />
      </LeftPanel>
      <MapLegend />
      <RightPanel />
      <TimelineStrip />
    </main>
  );
}
