const mongoose = require('mongoose');

/**
 * 與舊版 Keystone vrclassroom_cms 相同之 collection 名稱。
 * strict: false 以接受 Unity form 任意欄位；timestamps 產生 createdAt / updatedAt。
 */
function makeLegacySchema() {
  return new mongoose.Schema({}, { strict: false, timestamps: true });
}

const EventLookingData = mongoose.model('EventLookingData', makeLegacySchema(), 'event_lookingdatas');
const LookingData = mongoose.model('LookingData', makeLegacySchema(), 'lookingdatas');
const EventData = mongoose.model('EventData', makeLegacySchema(), 'eventdatas');
const AnimeData = mongoose.model('AnimeData', makeLegacySchema(), 'animedatas');
const LookingRangeData = mongoose.model('LookingRangeData', makeLegacySchema(), 'lookingrangedatas');

const COLLECTIONS = [
  { key: 'event_lookingdatas', Model: EventLookingData },
  { key: 'lookingdatas', Model: LookingData },
  { key: 'eventdatas', Model: EventData },
  { key: 'animedatas', Model: AnimeData },
  { key: 'lookingrangedatas', Model: LookingRangeData }
];

module.exports = {
  EventLookingData,
  LookingData,
  EventData,
  AnimeData,
  LookingRangeData,
  COLLECTIONS
};
