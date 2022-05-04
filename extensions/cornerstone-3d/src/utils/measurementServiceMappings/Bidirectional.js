import { annotation } from '@cornerstonejs/tools';

import SUPPORTED_TOOLS from './constants/supportedTools';
import getSOPInstanceAttributes from './utils/getSOPInstanceAttributes';
import { utils } from '@ohif/core';

const Bidirectional = {
  toAnnotation: measurement => {
    const annotationUID = measurement.uid;
    const cornerstone3DAnnotation = annotation.state.getAnnotation(
      annotationUID
    );

    if (!cornerstone3DAnnotation) {
      return;
    }

    if (cornerstone3DAnnotation.data.label !== measurement.label) {
      cornerstone3DAnnotation.data.label = measurement.label;
    }
  },
  toMeasurement: (
    csToolsEventDetail,
    DisplaySetService,
    Cornerstone3DViewportService,
    getValueTypeFromToolType
  ) => {
    const { annotation, viewportId } = csToolsEventDetail;
    const { metadata, data, annotationUID } = annotation;

    if (!metadata || !data) {
      console.warn('Length tool: Missing metadata or data');
      return null;
    }

    const { toolName, referencedImageId, FrameOfReferenceUID } = metadata;
    const validToolType = SUPPORTED_TOOLS.includes(toolName);

    if (!validToolType) {
      throw new Error('Tool not supported');
    }

    const {
      SOPInstanceUID,
      SeriesInstanceUID,
      StudyInstanceUID,
    } = getSOPInstanceAttributes(
      referencedImageId,
      Cornerstone3DViewportService,
      viewportId
    );

    let displaySet;

    if (SOPInstanceUID) {
      displaySet = DisplaySetService.getDisplaySetForSOPInstanceUID(
        SOPInstanceUID,
        SeriesInstanceUID
      );
    } else {
      displaySet = DisplaySetService.getDisplaySetsForSeries(SeriesInstanceUID);
    }

    const { points } = data.handles;

    const mappedAnnotations = getMappedAnnotations(
      annotation,
      DisplaySetService
    );

    const displayText = getDisplayText(mappedAnnotations);
    const getReport = () =>
      _getReport(mappedAnnotations, points, FrameOfReferenceUID);

    return {
      uid: annotationUID,
      SOPInstanceUID,
      FrameOfReferenceUID,
      points,
      metadata,
      referenceSeriesUID: SeriesInstanceUID,
      referenceStudyUID: StudyInstanceUID,
      toolName: metadata.toolName,
      displaySetInstanceUID: displaySet.displaySetInstanceUID,
      label: metadata.label,
      displayText: displayText,
      data: data.cachedStats,
      type: getValueTypeFromToolType(toolName),
      getReport,
    };
  },
};

function getMappedAnnotations(annotation, DisplaySetService) {
  const { metadata, data } = annotation;
  const { cachedStats } = data;
  const { referencedImageId, referencedSeriesInstanceUID } = metadata;
  const targets = Object.keys(cachedStats);

  if (!targets.length) {
    return;
  }

  const annotations = [];
  Object.keys(cachedStats).forEach(targetId => {
    const targetStats = cachedStats[targetId];

    let displaySet;

    if (targetId.startsWith('imageId:')) {
      const { SOPInstanceUID, SeriesInstanceUID } = getSOPInstanceAttributes(
        referencedImageId
      );

      displaySet = DisplaySetService.getDisplaySetForSOPInstanceUID(
        SOPInstanceUID,
        SeriesInstanceUID
      );
    } else {
      // Todo: separate imageId and volumeId, for now just implementing the
      // referenceImageId
      throw new Error('Not implemented');
    }

    const { SeriesNumber, SeriesInstanceUID } = displaySet;
    const { length, width } = targetStats;
    const unit = 'mm';

    annotations.push({
      SeriesInstanceUID,
      SeriesNumber,
      unit,
      length,
      width,
    });
  });

  return annotations;
}

/*
This function is used to convert the measurement data to a format that is
suitable for the report generation (e.g. for the csv report). The report
returns a list of columns and corresponding values.
*/
function _getReport(mappedAnnotations, points, FrameOfReferenceUID) {
  const columns = [];
  const values = [];

  // Add Type
  columns.push('AnnotationType');
  values.push('Cornerstone3D:Bidirectional');

  mappedAnnotations.forEach(annotation => {
    const { length, width } = annotation;
    columns.push(`Length (mm)`, `Width (mm)`);
    values.push(length, width);
  });

  if (FrameOfReferenceUID) {
    columns.push('FrameOfReferenceUID');
    values.push(FrameOfReferenceUID);
  }

  if (points) {
    columns.push('points');
    // points has the form of [[x1, y1, z1], [x2, y2, z2], ...]
    // convert it to string of [[x1 y1 z1];[x2 y2 z2];...]
    // so that it can be used in the csv report
    values.push(points.map(p => p.join(' ')).join(';'));
  }

  return {
    columns,
    values,
  };
}

function getDisplayText(mappedAnnotations) {
  if (!mappedAnnotations || !mappedAnnotations.length) {
    return '';
  }

  const displayText = [];

  // Area is the same for all series
  const { length, width, SeriesNumber } = mappedAnnotations[0];
  const roundedLength = utils.roundNumber(length, 2);
  const roundedWidth = utils.roundNumber(width, 2);

  displayText.push(`L: ${roundedLength} mm (S: ${SeriesNumber})`);
  displayText.push(`W: ${roundedWidth} mm`);

  return displayText;
}

export default Bidirectional;
