/*
  Wave Interference Distribution
  Points placed on a grid, sized by the combined amplitude of two circular
  wave sources. Creates the classic interference pattern with constructive
  and destructive bands.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Grid Size            (default: 600)
    n1  Resolution           (default: 30)   points per side
    n2  Source 1 X           (default: -100)
    n3  Source 1 Y           (default: 0)
    n4  Source 2 X           (default: 100)
    n5  Source 2 Y           (default: 0)
    n6  Wavelength           (default: 60)
*/

function waveInterferenceDistribution() {
    var gridSize = (typeof n0 !== "undefined") ? n0 : 600;
    var res = (typeof n1 !== "undefined") ? Math.max(Math.round(n1), 2) : 30;
    var s1x = (typeof n2 !== "undefined") ? n2 : -100;
    var s1y = (typeof n3 !== "undefined") ? n3 : 0;
    var s2x = (typeof n4 !== "undefined") ? n4 : 100;
    var s2y = (typeof n5 !== "undefined") ? n5 : 0;
    var wavelength = (typeof n6 !== "undefined") ? Math.max(Math.abs(n6), 1) : 60;

    var cloud = new cavalry.PointCloud();
    var half = gridSize / 2;
    var k = 2 * Math.PI / wavelength;

    for (var row = 0; row < res; row += 1) {
        var py = -half + gridSize * row / (res - 1);
        for (var col = 0; col < res; col += 1) {
            var px = -half + gridSize * col / (res - 1);

            var d1 = Math.sqrt((px - s1x) * (px - s1x) + (py - s1y) * (py - s1y));
            var d2 = Math.sqrt((px - s2x) * (px - s2x) + (py - s2y) * (py - s2y));

            var amp = (Math.sin(d1 * k) + Math.sin(d2 * k)) / 2;
            var s = (amp + 1) / 2;

            cloud.appendPoint(new cavalry.Point(px, py));
            cloud.appendSize(new cavalry.Point(s, s));
        }
    }

    return cloud;
}

waveInterferenceDistribution();
