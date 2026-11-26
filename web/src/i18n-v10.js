/* Strings for v10: automatic calibration, train detection, background tracking (English and German; other languages fall back to English). */
export default {
  en: {
    acTitle: 'Calibrating', acHint: 'Hold your phone and draw a figure eight in the air', acNoMotion: 'No motion sensor found. Calibrating the GPS only.',
    acSearching: 'searching', acMotion: 'Motion', acDoneTitle: 'Calibrated', acFailTitle: 'Calibration failed', acRetry: 'Try again',
    acResult: 'Calibrated. GPS accuracy about {acc} m.', acResultShift: 'Calibrated. Position corrected by {m} m, GPS accuracy about {acc} m.', acResultNoAcc: 'Calibrated.',
    acDenied: 'Location is off. Allow location and try again.', acNoFix: 'No GPS position yet. Go outside or near a window and try again.',
    acManual: 'Choose where I am instead', acSetOnMap: 'Set my position on the map',
    trainOn: 'You are on {line} towards {dir}', trainLeft: 'Left {t}', trainEarlier: '{n} min earlier than planned', trainLater: '{n} min later than planned', trainOther: 'Not the planned train, but it goes the same way', trainSame: 'Same direction, still on your route',
    offTrainSub: 'You seem to be on a different train. {d} from the planned route.',
  },
  de: {
    acTitle: 'Kalibriere', acHint: 'Halte das Handy und zeichne eine Acht in die Luft', acNoMotion: 'Kein Bewegungssensor gefunden. Nur GPS wird kalibriert.',
    acSearching: 'sucht', acMotion: 'Bewegung', acDoneTitle: 'Kalibriert', acFailTitle: 'Kalibrierung fehlgeschlagen', acRetry: 'Nochmal',
    acResult: 'Kalibriert. GPS-Genauigkeit etwa {acc} m.', acResultShift: 'Kalibriert. Position um {m} m korrigiert, GPS-Genauigkeit etwa {acc} m.', acResultNoAcc: 'Kalibriert.',
    acDenied: 'Standort ist aus. Erlaube den Standort und versuche es erneut.', acNoFix: 'Noch keine GPS-Position. Geh nach draußen oder ans Fenster und versuche es erneut.',
    acManual: 'Stattdessen meinen Standort wählen', acSetOnMap: 'Meine Position auf der Karte setzen',
    trainOn: 'Du bist in {line} Richtung {dir}', trainLeft: 'Abfahrt {t}', trainEarlier: '{n} Min früher als geplant', trainLater: '{n} Min später als geplant', trainOther: 'Nicht der geplante Zug, fährt aber in dieselbe Richtung', trainSame: 'Gleiche Richtung, weiter auf deiner Route',
    offTrainSub: 'Du sitzt wohl in einem anderen Zug. {d} von der geplanten Route entfernt.',
  },
};
