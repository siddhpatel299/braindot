'use client';

// Says out loud that a save did not happen.
//
// The failure this exists for is the quiet one: localStorage fills up, every
// write throws, and the app carries on looking exactly as it did — accepting
// text, showing the note, reporting nothing — until a reload takes back
// everything since the last write that worked.
//
// Renders nothing until something goes wrong.

import { useEffect, useRef } from 'react';
import { onStorageFailure } from '@/utils/storageHealth';
import { toast } from '@/hooks/use-toast';

/** Long enough that a burst of failed writes is one message, not twenty. */
const QUIET_PERIOD_MS = 30_000;

export function StorageAlert() {
  const lastShown = useRef(0);

  useEffect(() => {
    return onStorageFailure(({ outOfRoom }) => {
      const now = Date.now();
      if (now - lastShown.current < QUIET_PERIOD_MS) return;
      lastShown.current = now;

      toast(
        outOfRoom
          ? {
              variant: 'destructive',
              title: 'This browser is out of storage',
              description:
                'Your most recent changes could not be saved on this device. ' +
                'Removing a book or two from Reading frees the most room. ' +
                'If you are signed in, work already synced to the cloud is safe.',
            }
          : {
              variant: 'destructive',
              title: 'Changes could not be saved',
              description:
                'Something went wrong writing to this browser’s storage. ' +
                'Copy anything you have just written somewhere safe before reloading.',
            },
      );
    });
  }, []);

  return null;
}
